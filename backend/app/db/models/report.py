"""
reports — the frozen, immutable artifact.

`frozen_snapshot` plus the two storage keys are written exactly once —
but, since Phase 13, not necessarily at INSERT time. Generation is now an
async BackgroundTasks job (`app/jobs/reports.py`): a row is inserted
`status="PENDING"` immediately with an empty `frozen_snapshot`, then the
job transitions `current_stage` through `collecting -> rendering ->
finalising` and only writes `frozen_snapshot`/the storage keys/the two
hashes once, atomically, when it reaches `status="COMPLETED"`. A
`status="FAILED"` row never has storage keys and must never be served by
the download endpoint. Re-download of a COMPLETED row must still read
this row and stream the stored B2 object — never re-resolve the record or
re-render bytes, regardless of how generation itself has changed.

MVP scope: single compliance-record reports only; manufacturer/filtered-
scope reports are not modeled here.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    compliance_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=False, index=True
    )
    frozen_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    pdf_storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    docx_storage_key: Mapped[str | None] = mapped_column(String, nullable=True)
    generated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    generated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    # Phase 13 — async generation lifecycle + integrity. `status`:
    # PENDING | GENERATING | COMPLETED | FAILED (unconstrained String, same
    # convention as verification_status/compliance_status elsewhere in this
    # schema — enforced at the application layer, not a DB CHECK).
    # index=True matches migration 0006's own ix_reports_status — previously
    # model/migration drift (`alembic check` caught it during the 0001
    # baseline-freeze fix, R1.3, 2026-09-19).
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="COMPLETED", index=True
    )
    current_stage: Mapped[str | None] = mapped_column(String, nullable=True)
    report_format_version: Mapped[str] = mapped_column(String, nullable=False, server_default="1.0")
    pdf_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    docx_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
