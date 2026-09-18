"""
audit_events — append-only. Application/DB-role write policy should REVOKE
UPDATE and DELETE once real roles exist (Phase 3+); not enforced at the
schema level yet since Supabase role/grant setup is out of Phase 0 scope.

`actor_role`/`region`/`record_id`/`request_id` (migration 0007, Phase 1.2)
are denormalized copies of facts true AT THE TIME the event happened —
never joined live against `profiles`/`compliance_records` at read time.
`record_id` is additive alongside the existing polymorphic `entity_id`
(a mobile handoff event's entity is a ScanSession, not a ComplianceRecord)
so a per-record audit-trail query never has to branch on `entity_type`.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import BigInteger, DateTime, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_region_created_at", "region", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String, nullable=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    record_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
