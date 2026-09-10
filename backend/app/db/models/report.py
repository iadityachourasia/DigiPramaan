"""
reports — the frozen, immutable artifact.

`frozen_snapshot` plus the two storage keys are written exactly once, at
generation time. Re-download must read this row and stream the stored B2
object — never re-resolve the record or re-render bytes. MVP scope: single
compliance-record reports only; manufacturer/filtered-scope reports are not
modeled here.
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
