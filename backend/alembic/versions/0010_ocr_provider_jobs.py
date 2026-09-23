"""OP-Phase 3 — ocr_provider_jobs, the durable OpenParser work record.

This IS the outbox/work-item abstraction (spec §8): one row per
image-attempt, `local_state` + `next_poll_at` is what a worker claims
with `SELECT ... FOR UPDATE SKIP LOCKED`. See the model's own docstring
(app/db/models/ocr_provider_job.py) for the full state machine and
constraint rationale.

revision: 0010_ocr_provider_jobs
down_revision: 0009_evidence_image_override
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_ocr_provider_jobs"
down_revision: Union[str, None] = "0009_evidence_image_override"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ocr_provider_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "scan_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scan_sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "evidence_image_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("evidence_images.id"),
            nullable=False,
        ),
        sa.Column("angle", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("provider_tenant_alias", sa.String(), nullable=True),
        sa.Column("provider_key_alias", sa.String(), nullable=True),
        sa.Column("provider_batch_id", sa.String(), nullable=True),
        sa.Column("provider_job_id", sa.String(), nullable=True),
        sa.Column("client_item_id", sa.String(), nullable=True),
        sa.Column(
            "local_state", sa.String(), nullable=False, server_default="pending_submission"
        ),
        sa.Column("last_provider_state", sa.String(), nullable=True),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("canonical_request_sha256", sa.String(), nullable=False),
        sa.Column("model_id", sa.String(), nullable=False),
        sa.Column("output_format", sa.String(), nullable=False),
        sa.Column(
            "options_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("profile_version", sa.String(), nullable=False),
        sa.Column("catalog_snapshot_hash", sa.String(), nullable=True),
        sa.Column("input_storage_key", sa.String(), nullable=False),
        sa.Column("input_sha256", sa.String(), nullable=False),
        sa.Column("input_byte_count", sa.Integer(), nullable=False),
        sa.Column("input_width_px", sa.Integer(), nullable=True),
        sa.Column("input_height_px", sa.Integer(), nullable=True),
        sa.Column("input_media_type", sa.String(), nullable=False),
        sa.Column("derivative_storage_key", sa.String(), nullable=True),
        sa.Column("derivative_sha256", sa.String(), nullable=True),
        sa.Column("transform_manifest", postgresql.JSONB(), nullable=True),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("retry_reason", sa.String(), nullable=True),
        sa.Column(
            "parent_attempt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ocr_provider_jobs.id"),
            nullable=True,
        ),
        sa.Column("submission_lease_owner", sa.String(), nullable=True),
        sa.Column("submission_lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reconciliation_lease_owner", sa.String(), nullable=True),
        sa.Column("reconciliation_lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("poll_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_http_status", sa.Integer(), nullable=True),
        sa.Column("last_error_code", sa.String(), nullable=True),
        sa.Column("last_error_message", sa.String(), nullable=True),
        sa.Column("canonical_result_storage_key", sa.String(), nullable=True),
        sa.Column("canonical_result_sha256", sa.String(), nullable=True),
        sa.Column("canonical_result_byte_count", sa.Integer(), nullable=True),
        sa.Column("raw_result_storage_key", sa.String(), nullable=True),
        sa.Column("raw_result_sha256", sa.String(), nullable=True),
        sa.Column("raw_result_byte_count", sa.Integer(), nullable=True),
        sa.Column("normalization_adapter_version", sa.String(), nullable=True),
        sa.Column("normalized_artifact_storage_key", sa.String(), nullable=True),
        sa.Column("normalized_artifact_sha256", sa.String(), nullable=True),
        sa.Column("provider_page_count", sa.Integer(), nullable=True),
        sa.Column("cost_usage", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("attempt_number >= 1", name="ck_ocr_provider_jobs_attempt_number"),
        sa.CheckConstraint("poll_count >= 0", name="ck_ocr_provider_jobs_poll_count"),
        sa.CheckConstraint("input_byte_count >= 0", name="ck_ocr_provider_jobs_input_byte_count"),
        sa.CheckConstraint(
            "provider_page_count IS NULL OR provider_page_count >= 0",
            name="ck_ocr_provider_jobs_page_count",
        ),
        sa.CheckConstraint(
            "canonical_result_byte_count IS NULL OR canonical_result_byte_count >= 0",
            name="ck_ocr_provider_jobs_canonical_bytes",
        ),
        sa.CheckConstraint(
            "raw_result_byte_count IS NULL OR raw_result_byte_count >= 0",
            name="ck_ocr_provider_jobs_raw_bytes",
        ),
        sa.CheckConstraint(
            "local_state IN ("
            "'pending_submission','submitting','submitted','queued','running',"
            "'succeeded','artifacts_stored','normalized','failed','indeterminate'"
            ")",
            name="ck_ocr_provider_jobs_local_state",
        ),
        sa.CheckConstraint(
            "provider IN ('openparser','local_paddle')", name="ck_ocr_provider_jobs_provider"
        ),
        sa.CheckConstraint(
            "operation IN ('parse_single','parse_batch_child','local_legacy')",
            name="ck_ocr_provider_jobs_operation",
        ),
        sa.CheckConstraint(
            "(local_state != 'normalized') OR "
            "(normalized_artifact_storage_key IS NOT NULL AND normalized_artifact_sha256 IS NOT NULL)",
            name="ck_ocr_provider_jobs_normalized_requires_artifact",
        ),
    )

    op.create_index(
        "uq_ocr_provider_jobs_idempotency",
        "ocr_provider_jobs",
        ["provider", "provider_tenant_alias", "operation", "idempotency_key"],
        unique=True,
    )
    op.create_index(
        "uq_ocr_provider_jobs_provider_job",
        "ocr_provider_jobs",
        ["provider", "provider_tenant_alias", "provider_job_id"],
        unique=True,
        postgresql_where=sa.text("provider_job_id IS NOT NULL"),
    )
    op.create_index(
        "uq_ocr_provider_jobs_attempt",
        "ocr_provider_jobs",
        ["evidence_image_id", "profile_version", "input_sha256", "attempt_number"],
        unique=True,
    )
    op.create_index(
        "ix_ocr_provider_jobs_claim", "ocr_provider_jobs", ["local_state", "next_poll_at"]
    )
    op.create_index(
        "ix_ocr_provider_jobs_scan_evidence",
        "ocr_provider_jobs",
        ["scan_session_id", "evidence_image_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ocr_provider_jobs_scan_evidence", table_name="ocr_provider_jobs")
    op.drop_index("ix_ocr_provider_jobs_claim", table_name="ocr_provider_jobs")
    op.drop_index("uq_ocr_provider_jobs_attempt", table_name="ocr_provider_jobs")
    op.drop_index("uq_ocr_provider_jobs_provider_job", table_name="ocr_provider_jobs")
    op.drop_index("uq_ocr_provider_jobs_idempotency", table_name="ocr_provider_jobs")
    op.drop_table("ocr_provider_jobs")
