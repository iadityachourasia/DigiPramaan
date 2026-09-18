"""
api/v1/activity.py — GET /activity, the Global Activity Log (13 §3.2)'s one
read, backed by the real `audit_events` table (Phase 1.2's `emit()` choke
point) instead of the Next.js mock's in-memory `audit-store.ts`.

Scope (Phase 1.1's own fail-closed discipline, reused verbatim): National
sees every event; State sees only events whose `region` matches the
viewer's own — applied FIRST, before any of the filters below, exactly the
same ordering `list_records` already establishes.

Response shape matches the frontend's `ActivityPageResponse`
(src/lib/api/activity.ts) exactly: `rows`/`totalCount`/`page`/`pageSize`
plus `availableRegions` (for the filter's options) and `recordLabels`
(record id -> scan id, for rows that reference a record) — scoped to the
distinct record ids on the CURRENT page's rows, which is all
`ActivityTable.tsx` ever reads.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import false as sa_false
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession

from app.api.deps.permissions import require_permission
from app.db.models import AuditEvent, ComplianceRecord, Profile
from app.db.session import get_db
from app.services.audit import ACTIVITY_EVENT_TYPES
from app.services.authz.viewer import ViewerScope

router = APIRouter(tags=["activity"])

SYSTEM_ACTOR_FILTER = "__system"
CITIZEN_ACTOR_FILTER = "__citizen"


def _parse_date_boundary(value: str, *, end_of_day: bool = False) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if end_of_day and parsed.time() == datetime.min.time():
        # A bare date (no time component) means "the whole day" for
        # `dateTo` — matches audit-store.ts's own `${dateTo}T23:59:59.999Z`
        # convention, not a half-open midnight boundary that would silently
        # exclude the entire day it names.
        parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _project_detail(detail: dict | None) -> dict:
    """`AuditEvent.detail` is a heterogeneous JSONB blob (different keys per
    event_type — see every emit() call site). The frontend `ActivityEvent`
    type wants exactly two shapes: `fieldId`/`oldValue`/`newValue` for a
    correction, or a plain `detail` string for everything else. Never
    fabricates text that isn't already in the stored payload."""
    if not detail:
        return {}
    if "fieldId" in detail:
        out: dict = {"fieldId": detail["fieldId"]}
        if detail.get("oldValue") is not None:
            out["oldValue"] = detail["oldValue"]
        if detail.get("newValue") is not None:
            out["newValue"] = detail["newValue"]
        return out
    if detail.get("note"):
        return {"detail": detail["note"]}
    summary = ", ".join(f"{k}: {v}" for k, v in detail.items() if v is not None)
    return {"detail": summary} if summary else {}


@router.get("/activity")
def list_activity(
    actor_user_ids: list[str] = Query(default=[], alias="actorUserIds"),
    types: list[str] = Query(default=[], alias="types"),
    regions: list[str] = Query(default=[], alias="regions"),
    date_from: str | None = Query(default=None, alias="dateFrom"),
    date_to: str | None = Query(default=None, alias="dateTo"),
    record_id: str | None = Query(default=None, alias="recordId"),
    sort: str = "newest",
    page: int = 1,
    page_size: int = Query(default=20, alias="pageSize"),
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("activity.view")),
) -> dict:
    viewer = ViewerScope.from_profile(current_user)

    query = db.query(AuditEvent, Profile.full_name).outerjoin(
        Profile, Profile.id == AuditEvent.actor_id
    )
    if not viewer.is_national:
        query = query.filter(AuditEvent.region == viewer.region)

    if actor_user_ids:
        conditions = []
        if SYSTEM_ACTOR_FILTER in actor_user_ids:
            conditions.append(AuditEvent.actor_id.is_(None))
        real_ids = []
        for raw in actor_user_ids:
            if raw in (SYSTEM_ACTOR_FILTER, CITIZEN_ACTOR_FILTER):
                continue
            try:
                real_ids.append(uuid.UUID(raw))
            except ValueError:
                continue
        if real_ids:
            conditions.append(AuditEvent.actor_id.in_(real_ids))
        # No matching condition (e.g. only the citizen sentinel, which no
        # backend-emitted event carries yet) -> zero rows, never "unfiltered".
        query = query.filter(or_(*conditions)) if conditions else query.filter(sa_false())

    valid_types = [t for t in types if t in ACTIVITY_EVENT_TYPES]
    if valid_types:
        query = query.filter(AuditEvent.event_type.in_(valid_types))

    if regions:
        query = query.filter(AuditEvent.region.in_(regions))

    if date_from:
        parsed = _parse_date_boundary(date_from)
        if parsed is not None:
            query = query.filter(AuditEvent.created_at >= parsed)
    if date_to:
        parsed = _parse_date_boundary(date_to, end_of_day=True)
        if parsed is not None:
            query = query.filter(AuditEvent.created_at <= parsed)

    if record_id:
        try:
            query = query.filter(AuditEvent.record_id == uuid.UUID(record_id))
        except ValueError:
            pass

    total_count = query.count()
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    order_col = AuditEvent.created_at.asc() if sort == "oldest" else AuditEvent.created_at.desc()
    order_tiebreak = AuditEvent.id.asc() if sort == "oldest" else AuditEvent.id.desc()
    rows = (
        query.order_by(order_col, order_tiebreak)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result_rows = []
    record_ids: set[uuid.UUID] = set()
    for event, actor_name in rows:
        entry: dict = {
            "id": str(event.id),
            "type": event.event_type,
            "createdAt": event.created_at.isoformat(),
        }
        if event.record_id is not None:
            entry["recordId"] = str(event.record_id)
            record_ids.add(event.record_id)
        if event.actor_id is not None:
            entry["actorUserId"] = str(event.actor_id)
        if event.actor_role:
            entry["actorRole"] = event.actor_role
        if actor_name:
            entry["actorUserName"] = actor_name
        if event.region:
            entry["region"] = event.region
        entry.update(_project_detail(event.detail))
        result_rows.append(entry)

    record_labels: dict[str, str] = {}
    if record_ids:
        for record in (
            db.query(ComplianceRecord.id, ComplianceRecord.scan_session_id)
            .filter(ComplianceRecord.id.in_(record_ids))
            .all()
        ):
            if record.scan_session_id:
                record_labels[str(record.id)] = str(record.scan_session_id)

    regions_query = db.query(AuditEvent.region).filter(AuditEvent.region.isnot(None))
    if not viewer.is_national:
        regions_query = regions_query.filter(AuditEvent.region == viewer.region)
    available_regions = sorted({r for (r,) in regions_query.distinct().all()})

    return {
        "rows": result_rows,
        "totalCount": total_count,
        "page": page,
        "pageSize": page_size,
        "availableRegions": available_regions,
        "recordLabels": record_labels,
    }
