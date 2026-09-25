"""
api/v1/notifications.py — GET /notifications, GET /notifications/unread-count,
POST /notifications/{id}/read, POST /notifications/read-all.

Unlike every other real route in this app, none of these are permission-
gated with `require_permission` — a notification's `recipient_id` already
IS the narrowest possible scope (this user's own inbox), so
`Depends(get_current_user)` alone is the correct dependency: any
authenticated role manages only their own notifications, and there's
nothing further to authorize.

Response shape for GET /notifications mirrors GET /activity's own
(`rows`/`totalCount`/`page`/`pageSize`) plus `unreadCount` (so the header
bell and the full page never need two separate requests to agree) and a
`recordLabels` map built the same way activity.py's own does.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.db.models import ComplianceRecord, Notification, Profile
from app.db.session import get_db
from app.services.notifications.vocabulary import NOTIFICATION_TYPES

router = APIRouter(tags=["notifications"], prefix="/notifications")


def _to_entry(notification: Notification) -> dict:
    entry: dict = {
        "id": str(notification.id),
        "type": notification.type,
        "createdAt": notification.created_at.isoformat(),
        "readAt": notification.read_at.isoformat() if notification.read_at else None,
    }
    if notification.record_id is not None:
        entry["recordId"] = str(notification.record_id)
    if notification.entity_type:
        entry["entityType"] = notification.entity_type
    if notification.entity_id is not None:
        entry["entityId"] = str(notification.entity_id)
    if notification.detail:
        entry["detail"] = notification.detail
    return entry


@router.get("")
def list_notifications(
    read: bool | None = Query(default=None),
    types: list[str] = Query(default=[], alias="type"),
    page: int = 1,
    page_size: int = Query(default=20, alias="pageSize"),
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    query = db.query(Notification).filter(Notification.recipient_id == current_user.id)

    if read is True:
        query = query.filter(Notification.read_at.isnot(None))
    elif read is False:
        query = query.filter(Notification.read_at.is_(None))

    valid_types = [t for t in types if t in NOTIFICATION_TYPES]
    if valid_types:
        query = query.filter(Notification.type.in_(valid_types))

    total_count = query.count()
    unread_count = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id)
        .filter(Notification.read_at.is_(None))
        .count()
    )

    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    rows = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    record_ids = {row.record_id for row in rows if row.record_id is not None}
    record_labels: dict[str, str] = {}
    if record_ids:
        for record in (
            db.query(ComplianceRecord.id, ComplianceRecord.scan_session_id)
            .filter(ComplianceRecord.id.in_(record_ids))
            .all()
        ):
            if record.scan_session_id:
                record_labels[str(record.id)] = str(record.scan_session_id)

    return {
        "rows": [_to_entry(row) for row in rows],
        "totalCount": total_count,
        "page": page,
        "pageSize": page_size,
        "unreadCount": unread_count,
        "recordLabels": record_labels,
    }


@router.get("/unread-count")
def get_unread_count(
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    unread_count = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id)
        .filter(Notification.read_at.is_(None))
        .count()
    )
    return {"unreadCount": unread_count}


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .filter(Notification.recipient_id == current_user.id)
        .first()
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)

    return _to_entry(notification)


@router.post("/read-all")
def mark_all_notifications_read(
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    now = datetime.now(timezone.utc)
    updated = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id)
        .filter(Notification.read_at.is_(None))
        .update({"read_at": now}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}
