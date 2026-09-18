"""
record_review_flags — Phase 1.3's real backend for the manual Needs Review
escalation (src/types/compliance.ts's `needsReviewFlag`/`needsReviewByUserId`/
`needsReviewNote`). Independent of the checklist-computed signal
(services/records/serialize.py's `_needs_review_flagged`) — an officer can
raise this on a record whose checklist is currently clean, and the two
signals are OR'd together at read time, never merged into one column.

Raising and clearing are both real write events (who, when, why), not a
single mutable boolean — matching migration 0008's own docstring.
"""

from __future__ import annotations

import datetime
import uuid

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class RecordReviewFlag(Base):
    __tablename__ = "record_review_flags"
    # Matches migration 0008 exactly: at most one ACTIVE row per record.
    __table_args__ = (
        Index(
            "uq_record_review_flags_one_active",
            "record_id",
            unique=True,
            postgresql_where=sa.text("status = 'ACTIVE'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=False, index=True
    )
    # ACTIVE | CLEARED
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    flagged_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    flagged_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    cleared_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    cleared_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
