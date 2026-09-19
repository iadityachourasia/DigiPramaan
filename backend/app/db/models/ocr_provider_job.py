"""
ocr_provider_jobs — OP-Phase 3's durable work record for one OCR
provider attempt on one evidence image. This IS the outbox/work-item
abstraction spec §8 asks for (no separate table): `local_state` +
`next_poll_at` + the lease columns below are what a worker claims,
`SELECT ... FOR UPDATE SKIP LOCKED`, the same way `scan_sessions.stages`
is this codebase's existing "one row is its own progress source of
truth" convention (see scan.py's own module docstring) rather than a
parallel queue table.

Every transition goes through `services/ocr/openparser/persistence.py`'s
`transition_state()` — a compare-and-set on `local_state`, never a bare
UPDATE — so two workers racing on the same stale lease can never both
apply their result; the loser's `rowcount == 0` and it reloads. This is
Phase 3's chosen mechanism instead of a version column, matching spec
§8.1's "compare-and-set/optimistically locked or row-locked" — claiming
already uses real row locks, so a second counter column would be
redundant.

Local states (spec §8.1):
    pending_submission -> submitting -> submitted -> queued -> running
                                                    -> succeeded -> artifacts_stored -> normalized
                                                    -> failed
                                                    -> indeterminate
    submitting --stale lease--> pending_submission (same idempotency key)

Only normalized/failed/policy-resolved indeterminate are terminal.
`succeeded` is not complete until required artifacts are hashed and
stored (artifacts_stored), then normalized into the app's own shape
(Phase 4 — this table just tracks the storage keys/hashes, not the
adapter itself).

`provider`/`local_state`/`operation` are plain String + CheckConstraint,
matching this codebase's existing, deliberate avoidance of native
Postgres ENUM types everywhere else (audit_events.event_type,
compliance_records.verification_status, Report.status, ...) — enforced
at the application layer's vocabulary constants plus a DB-level CHECK as
a backstop, not a native enum migration headache.

One row per image-attempt, whether admitted standalone (`parse_single`)
or as a batch child (`parse_batch_child`) — `provider_batch_id` +
`client_item_id` distinguish a batch child from a standalone submission.
`provider_key_alias` persists `OpenParserKeyPool`'s own `key-N` alias for
this attempt, closing that pool's disclosed in-memory-only pin
limitation (services/ocr/openparser/pool.py's own docstring) — once this
row exists, the pin survives a process restart.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class OcrProviderJob(Base):
    __tablename__ = "ocr_provider_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )

    # --- identity / provenance -------------------------------------------------
    scan_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_sessions.id"), nullable=False
    )
    evidence_image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evidence_images.id"), nullable=False
    )
    # Copied at row-creation time from evidence_images.angle — immutable
    # provenance even if the source image is later superseded (OP-Phase 1's
    # delete-then-insert replacement flow).
    angle: Mapped[str] = mapped_column(String, nullable=False)

    # --- provider identity -------------------------------------------------
    provider: Mapped[str] = mapped_column(String, nullable=False)  # "openparser" | "local_paddle"
    provider_tenant_alias: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_key_alias: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_batch_id: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    client_item_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # --- state -------------------------------------------------------------
    local_state: Mapped[str] = mapped_column(
        String, nullable=False, server_default="pending_submission"
    )
    last_provider_state: Mapped[str | None] = mapped_column(String, nullable=True)
    # "parse_single" | "parse_batch_child" | "local_legacy"
    operation: Mapped[str] = mapped_column(String, nullable=False)

    # --- idempotency (spec §9) ----------------------------------------------
    idempotency_key: Mapped[str] = mapped_column(String, nullable=False)
    canonical_request_sha256: Mapped[str] = mapped_column(String, nullable=False)

    # --- request shape -------------------------------------------------------
    model_id: Mapped[str] = mapped_column(String, nullable=False)
    output_format: Mapped[str] = mapped_column(String, nullable=False)
    options_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    profile_version: Mapped[str] = mapped_column(String, nullable=False)
    catalog_snapshot_hash: Mapped[str | None] = mapped_column(String, nullable=True)

    # --- original input provenance ------------------------------------------
    input_storage_key: Mapped[str] = mapped_column(String, nullable=False)
    input_sha256: Mapped[str] = mapped_column(String, nullable=False)
    input_byte_count: Mapped[int] = mapped_column(Integer, nullable=False)
    input_width_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_height_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_media_type: Mapped[str] = mapped_column(String, nullable=False)

    # --- derivative (e.g. resized/transcoded upload payload), if any --------
    derivative_storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    derivative_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    transform_manifest: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- attempt lineage -------------------------------------------------
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    retry_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ocr_provider_jobs.id"), nullable=True
    )

    # --- leases (worker claiming) -------------------------------------------
    submission_lease_owner: Mapped[str | None] = mapped_column(String, nullable=True)
    submission_lease_expires_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reconciliation_lease_owner: Mapped[str | None] = mapped_column(String, nullable=True)
    reconciliation_lease_expires_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- provider-reported timestamps ---------------------------------------
    provider_created_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider_started_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider_completed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- polling ---------------------------------------------------------
    next_poll_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    poll_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String, nullable=True)
    # Sanitized only — never a raw response body (client.py's own redact.py
    # discipline applies here too).
    last_error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    # --- results: canonical (openparser@1) ------------------------------
    canonical_result_storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    canonical_result_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    canonical_result_byte_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # --- results: raw (provider-native envelope) --------------------------
    raw_result_storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_result_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_result_byte_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # --- normalization (OP-Phase 4 writes these; this table just tracks them) --
    normalization_adapter_version: Mapped[str | None] = mapped_column(String, nullable=True)
    normalized_artifact_storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    normalized_artifact_sha256: Mapped[str | None] = mapped_column(String, nullable=True)

    # --- provider cost/usage metadata, when returned -------------------------
    provider_page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- local bookkeeping -------------------------------------------------
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index(
            "uq_ocr_provider_jobs_idempotency",
            "provider",
            "provider_tenant_alias",
            "operation",
            "idempotency_key",
            unique=True,
        ),
        Index(
            "uq_ocr_provider_jobs_provider_job",
            "provider",
            "provider_tenant_alias",
            "provider_job_id",
            unique=True,
            postgresql_where=text("provider_job_id IS NOT NULL"),
        ),
        Index(
            "uq_ocr_provider_jobs_attempt",
            "evidence_image_id",
            "profile_version",
            "input_sha256",
            "attempt_number",
            unique=True,
        ),
        Index("ix_ocr_provider_jobs_claim", "local_state", "next_poll_at"),
        Index("ix_ocr_provider_jobs_scan_evidence", "scan_session_id", "evidence_image_id"),
        CheckConstraint("attempt_number >= 1", name="ck_ocr_provider_jobs_attempt_number"),
        CheckConstraint("poll_count >= 0", name="ck_ocr_provider_jobs_poll_count"),
        CheckConstraint("input_byte_count >= 0", name="ck_ocr_provider_jobs_input_byte_count"),
        CheckConstraint(
            "provider_page_count IS NULL OR provider_page_count >= 0",
            name="ck_ocr_provider_jobs_page_count",
        ),
        CheckConstraint(
            "canonical_result_byte_count IS NULL OR canonical_result_byte_count >= 0",
            name="ck_ocr_provider_jobs_canonical_bytes",
        ),
        CheckConstraint(
            "raw_result_byte_count IS NULL OR raw_result_byte_count >= 0",
            name="ck_ocr_provider_jobs_raw_bytes",
        ),
        CheckConstraint(
            "local_state IN ("
            "'pending_submission','submitting','submitted','queued','running',"
            "'succeeded','artifacts_stored','normalized','failed','indeterminate'"
            ")",
            name="ck_ocr_provider_jobs_local_state",
        ),
        CheckConstraint(
            "provider IN ('openparser','local_paddle')", name="ck_ocr_provider_jobs_provider"
        ),
        CheckConstraint(
            "operation IN ('parse_single','parse_batch_child','local_legacy')",
            name="ck_ocr_provider_jobs_operation",
        ),
        CheckConstraint(
            "(local_state != 'normalized') OR "
            "(normalized_artifact_storage_key IS NOT NULL AND normalized_artifact_sha256 IS NOT NULL)",
            name="ck_ocr_provider_jobs_normalized_requires_artifact",
        ),
    )
