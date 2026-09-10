"""
risk_alerts — Smart Risk, deterministic and explainable only (no ML).

`scope_level`/`scope_jurisdiction_id` are added now, at schema-creation
time, even though the MVP risk engine computes live over the requesting
viewer's own scope rather than maintaining the fuller canonical-assessment-
plus-scoped-projection architecture from the long-term design. Adding these
columns now means that fuller engine is a behavior change post-hackathon,
not a schema migration.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class RiskAlert(Base):
    __tablename__ = "risk_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    subject_type: Mapped[str] = mapped_column(String, nullable=False)  # COMPANY | PRODUCT
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String, nullable=False)
    score_contribution: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")
    evidence_record_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Jurisdiction scoping — populated now, projection engine deferred (see
    # module docstring).
    scope_level: Mapped[str | None] = mapped_column(String, nullable=True)
    scope_jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
