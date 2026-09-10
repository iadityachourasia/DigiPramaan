"""
violation_cases / case_status_history — Compliance Follow-Through.

MVP lifecycle: OPEN -> ACTION_REQUIRED -> REINSPECTION_REQUIRED -> RESOLVED
-> CLOSED. "Flag for Enforcement" creates or safely reuses the active case
for a record — never a second concurrent one — which is why the DB itself
enforces at most one non-CLOSED case per `originating_record_id` via a
partial unique index, not just an application-level check that a bug could
bypass.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ViolationCase(Base):
    __tablename__ = "violation_cases"
    __table_args__ = (
        Index(
            "uq_one_open_case_per_record",
            "originating_record_id",
            unique=True,
            postgresql_where=text("status <> 'CLOSED'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    originating_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="OPEN")
    deadline_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    assigned_officer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CaseStatusHistory(Base):
    __tablename__ = "case_status_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("violation_cases.id"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String, nullable=True)
    to_status: Mapped[str] = mapped_column(String, nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    changed_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    note: Mapped[str | None] = mapped_column(String, nullable=True)
