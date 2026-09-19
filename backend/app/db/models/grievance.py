"""
grievances — the Citizen Grievance Portal's own row per submission
(2026-09-20), one-to-one with the `ScanSession` it creates
(`source="Citizen-Reported"`, `created_by=NULL`).

PII (`submitter_name`/`submitter_contact`) is optional at submission and
never serialized into the officer-facing record — `records/serialize.py`
exposes only a `hasContactDetails` boolean derived from whether
`submitter_contact` is set, never the value itself.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Grievance(Base):
    __tablename__ = "grievances"
    __table_args__ = (
        Index("ix_grievances_reference", "reference", unique=True),
        Index("ix_grievances_scan_session_id", "scan_session_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    reference: Mapped[str] = mapped_column(String, nullable=False)
    scan_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_sessions.id"), nullable=False
    )
    submitted_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    concerns: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    concern_note: Mapped[str | None] = mapped_column(String, nullable=True)
    shop_name_or_location: Mapped[str | None] = mapped_column(String, nullable=True)
    quality_note: Mapped[str | None] = mapped_column(String, nullable=True)
    submitter_name: Mapped[str | None] = mapped_column(String, nullable=True)
    submitter_contact: Mapped[str | None] = mapped_column(String, nullable=True)
