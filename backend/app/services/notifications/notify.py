"""
services/notifications/notify.py — notify()/notify_many(), the ONE place a
`Notification` row is constructed.

WRITTEN IN THE SAME TRANSACTION AS THE MUTATION IT DOCUMENTS
--------------------------------------------------------------
Exactly `services/audit/emit.py`'s own discipline: `db.add()` only, never
`db.commit()` — the caller's own commit (the same one that persists
whatever the notification is ABOUT) is what actually writes it. A
notification can never exist for a mutation that didn't happen.

`notify()` is the 1:1 case (one specific recipient — e.g. the officer a
case was just reassigned to). `notify_many()` is the broadcast case (every
Enforcement Officer, after a rule-threshold change) — it de-duplicates
`recipient_ids` and inserts one row per recipient in the same transaction.
Both silently no-op on an empty/None recipient — every call site is
expected to guard "don't notify the actor about their own action" itself
(e.g. `if record.assigned_officer_id and record.assigned_officer_id !=
current_user.id`), since only the call site knows who the actor was.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models import ComplianceRecord, Notification
from app.services.notifications.vocabulary import NOTIFICATION_TYPES


def _validate(notification_type: str) -> None:
    if notification_type not in NOTIFICATION_TYPES:
        raise ValueError(
            f"Unrecognized notification type: {notification_type!r} — add it to "
            "services/notifications/vocabulary.py (and its src/types/notifications.ts "
            "mirror) first."
        )


def notify(
    db: Session,
    recipient_id: uuid.UUID | None,
    notification_type: str,
    *,
    record: ComplianceRecord | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    detail: dict | None = None,
) -> Notification | None:
    """Returns `None` (a genuine no-op) when `recipient_id` is `None` — the
    common case being a record with no `assigned_officer_id` yet."""
    if recipient_id is None:
        return None

    _validate(notification_type)

    if record is not None:
        if entity_type is None:
            entity_type = "ComplianceRecord"
        if entity_id is None:
            entity_id = record.id
        record_id = record.id
    else:
        record_id = None

    notification = Notification(
        recipient_id=recipient_id,
        type=notification_type,
        record_id=record_id,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
    )
    db.add(notification)
    return notification


def notify_many(
    db: Session,
    recipient_ids: set[uuid.UUID],
    notification_type: str,
    *,
    record: ComplianceRecord | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    detail: dict | None = None,
) -> list[Notification]:
    """The broadcast sibling of `notify()` — one row per recipient, all in
    the caller's transaction. An empty `recipient_ids` set is a real,
    silent no-op (e.g. no active officers found in scope), not an error."""
    if not recipient_ids:
        return []

    _validate(notification_type)

    if record is not None:
        if entity_type is None:
            entity_type = "ComplianceRecord"
        if entity_id is None:
            entity_id = record.id
        record_id = record.id
    else:
        record_id = None

    notifications = [
        Notification(
            recipient_id=recipient_id,
            type=notification_type,
            record_id=record_id,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail,
        )
        for recipient_id in recipient_ids
    ]
    db.add_all(notifications)
    return notifications
