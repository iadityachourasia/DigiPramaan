"""
scan_sessions / evidence_images — the persisted pipeline.

`ScanSession.stages` (JSONB, shaped exactly like the frontend's existing
`PipelineStage[]`) is the ONLY source of truth for pipeline progress. The
worker that runs OCR/extraction/rules must persist this column after every
stage transition, never hold progress only in a running coroutine's local
state — a process crash or restart must never lose what `GET
/scans/{id}/pipeline` has already told a polling client.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ScanSession(Base):
    __tablename__ = "scan_sessions"
    __table_args__ = (
        # Citizen Grievance Portal fix: a grievance-sourced scan has no
        # signed-in officer to attribute `created_by` to (the whole point
        # of the portal is "no account, no form-filling"). Every OTHER
        # source must still name a real creator — this is not a general
        # nullability relaxation, only the one documented exception.
        CheckConstraint(
            "created_by IS NOT NULL OR source = 'Citizen-Reported'",
            name="ck_scan_sessions_created_by_or_citizen_reported",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    # Stable from creation, even before the record exists, so the tracker
    # can link to it once ready — the same property PipelineRun.recordId
    # already has in the current mock store.
    #
    # This FK and compliance_records.scan_session_id point at each other —
    # a genuine circular reference (a scan produces a record; a record
    # remembers which scan produced it). `create_all()` resolves this
    # automatically for CREATE, but `drop_all()` cannot break the cycle
    # without a named constraint to target with `DROP CONSTRAINT` — hence
    # the explicit `name=` here (confirmed necessary by an actual failed
    # downgrade against live Supabase, not by inspection alone).
    record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compliance_records.id", name="fk_scan_sessions_record_id"),
        nullable=True,
    )
    # "Officer-Scanned" | "Citizen-Reported" | "E-commerce-Sourced" (Phase 9)
    # — copied onto the produced ComplianceRecord verbatim by run_pipeline().
    source: Mapped[str] = mapped_column(String, nullable=False, default="Officer-Scanned")
    # Set only for source == "E-commerce-Sourced".
    ecommerce_listing_url: Mapped[str | None] = mapped_column(String, nullable=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ecommerce_batches.id"), nullable=True, index=True
    )
    # PipelineStage[] — { id, state, summary?, failureReason? } per element,
    # persisted after every transition (see module docstring).
    stages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EvidenceImage(Base):
    __tablename__ = "evidence_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    scan_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_sessions.id"), nullable=False, index=True
    )
    angle: Mapped[str] = mapped_column(String, nullable=False)
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    content_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # { checks: [...], overall_verdict: PASS|RECAPTURE_REQUIRED|REVIEW, ... }
    # Retained even after a rejected image's bytes are deleted from storage —
    # the quality metadata is an audit fact independent of whether the
    # underlying object still exists.
    quality_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    uploaded_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # OP-Phase 1 (migration 0009) — the officer-override audit trail, layered
    # on top of the immutable `quality_result.overall_verdict` above, never
    # replacing it. An image is OVERRIDDEN exactly when override_reason is
    # set; derived at read time (services/scans/intake.py), never stored as
    # a redundant status column.
    override_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    overridden_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    overridden_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class EcommerceBatch(Base):
    """One bulk-mode submission (Phase 9): the category/search page an
    officer scanned, grouping the independent `ScanSession` rows it
    produced. A real FK target rather than a bare string column, so
    `scan_sessions.batch_id` has referential integrity — this table
    carries the ONE thing no individual listing's own
    `ecommerce_listing_url` can hold: the category page itself, distinct
    from any of the product pages found on it."""

    __tablename__ = "ecommerce_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
