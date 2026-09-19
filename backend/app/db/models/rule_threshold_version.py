"""
rule_threshold_versions — Admin Console's configurable-thresholds page
(2026-09-20). Append-only: a PUT inserts a new row rather than updating
one in place, matching this schema's existing "one row is its own
version/progress source of truth" discipline (`reports.status`,
`scan_sessions.stages`). "The current value" is whichever row has the
latest `created_at` — see services/admin/thresholds.py.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class RuleThresholdVersion(Base):
    __tablename__ = "rule_threshold_versions"
    __table_args__ = (Index("ix_rule_threshold_versions_created_at", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    values: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
