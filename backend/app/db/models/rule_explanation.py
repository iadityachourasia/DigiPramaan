"""
rule_explanations — Phase 6's cached Gemini violation explanations.

One row per (compliance_record_id, rule_id). `input_hash` is a hash of the
authoritative facts the explanation was generated from (rule id, status,
message, evidence, officer resolution) — a repeated /explain call with the
same hash serves this row with zero Gemini calls, and post-verification the
underlying facts never change again, so the cache is what keeps a verified
record's explanation from silently changing (see
services/explanation/gemini_explainer.py's own docstring on the hard
boundary between this table and the rule engine's own authoritative state:
this table is never read by anything that computes compliance_status/
checklist/violations/compliance_score).
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class RuleExplanation(Base):
    __tablename__ = "rule_explanations"
    # Matches migration 0002's own uq_rule_explanations_record_rule —
    # previously model/migration drift (`alembic check` caught it during
    # the 0001 baseline-freeze fix, R1.3, 2026-09-19); one row per
    # (record, rule) is this table's own documented invariant.
    __table_args__ = (
        UniqueConstraint(
            "compliance_record_id", "rule_id", name="uq_rule_explanations_record_rule"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    compliance_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=False, index=True
    )
    rule_id: Mapped[str] = mapped_column(String, nullable=False)
    input_hash: Mapped[str] = mapped_column(String, nullable=False)
    explanation: Mapped[dict] = mapped_column(JSONB, nullable=False)
    model_name: Mapped[str] = mapped_column(String, nullable=False)
    generated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
