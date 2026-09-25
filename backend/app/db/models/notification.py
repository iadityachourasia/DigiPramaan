"""
notifications — a per-recipient feed, distinct from `audit_events`
(db/models/audit_event.py). `audit_events` is a generic, append-only
system-wide log with no concept of "who should be told" or "have they seen
it yet" — this table exists specifically to answer those two questions, so
it carries its own `recipient_id`/`read_at` rather than trying to derive
them from an audit row at read time.

Like `AuditEvent`, no stored English text: `type` + `detail` only, resolved
to human copy client-side via i18n (`notifications.type.<type>` in
src/messages/*.json) — the same discipline this app's Activity Log already
uses, so Hindi support falls out for free instead of needing a second
english-string column.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_recipient_read", "recipient_id", "read_at"),
        Index("ix_notifications_recipient_created", "recipient_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # Additive alongside the polymorphic entity_type/entity_id pair, same
    # reason audit_events keeps both: most notifications are about a
    # ComplianceRecord, and a per-record query should never have to branch
    # on entity_type to find them.
    record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=True
    )
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    read_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
