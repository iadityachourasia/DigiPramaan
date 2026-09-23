"""
services/audit/emit.py — emit(), the ONE place an `AuditEvent` row is
constructed. Every direct `AuditEvent(...)` this codebase used to
construct by hand (api/v1/mobile_handoff.py, api/v1/records.py) was
migrated to call this instead — see each call site's own comment.

WRITTEN IN THE SAME TRANSACTION AS THE MUTATION
--------------------------------------------------
`emit()` calls `db.add(event)` and returns it — it deliberately never
calls `db.commit()` itself. The caller's own `db.commit()` (the same one
that persists whatever the event is ABOUT) is what actually writes it, so
an event can never exist for a mutation that didn't happen, and a
mutation can never silently happen with no event — both commit or neither
does. `jobs/pipeline.py`'s stage-completion events are the one exception
worth naming explicitly: `_persist()` already commits after every stage
transition, so an event emitted just before that call lands in the SAME
commit as the stage-state write it documents.

`record_id`/`region` ARE A HISTORICAL SNAPSHOT
--------------------------------------------------
When `record` is given, this stamps the record's CURRENT `region` onto
the event — a permanent fact about where this action happened, never
re-derived later. See db/models/audit_event.py's own docstring, and
src/types/history.ts's matching `ActivityEvent.region` comment.
"""

from __future__ import annotations

import uuid

import structlog
from sqlalchemy.orm import Session

from app.db.models import AuditEvent, ComplianceRecord, Profile
from app.services.audit.vocabulary import ACTIVITY_EVENT_TYPES


def _current_request_id() -> str | None:
    """core/logging.py's RequestIdMiddleware binds `request_id` into
    structlog's contextvars for the lifetime of the request — read back
    here rather than threading a `Request` object through every single
    mutation function just to log one correlation id."""
    return structlog.contextvars.get_contextvars().get("request_id")


def emit(
    db: Session,
    event_type: str,
    *,
    viewer: Profile | None = None,
    actor_id: uuid.UUID | None = None,
    actor_role: str | None = None,
    record: ComplianceRecord | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    region: str | None = None,
    detail: dict | None = None,
) -> AuditEvent:
    """`viewer=None` (and no `actor_id`) is for a system-generated event
    (a pipeline stage completing) or a citizen-sourced action (no account
    exists to name). `actor_id`/`actor_role` are a lower-level alternative
    to `viewer` for a caller that only has a bare `created_by`-style UUID
    in scope, not a loaded `Profile` — `viewer`, when given, always wins
    over these two. `record`, when given, auto-fills `entity_type`/
    `entity_id` (unless the caller explicitly overrides them — e.g. a
    mobile-handoff event whose entity is a ScanSession, not yet a
    ComplianceRecord) and always fills `record_id`/`region`. `region` is a
    standalone override for the (common, pre-verification) case where no
    ComplianceRecord exists yet but the region is already known — e.g. a
    ScanSession's own `region`, collected at intake — `record.region`
    always wins over it when `record` is given."""
    if event_type not in ACTIVITY_EVENT_TYPES:
        raise ValueError(
            f"Unrecognized activity event type: {event_type!r} — add it to "
            "services/audit/vocabulary.py (and its src/types/history.ts mirror) first."
        )

    if viewer is not None:
        actor_id = viewer.id
        actor_role = viewer.role

    if record is not None:
        if entity_type is None:
            entity_type = "ComplianceRecord"
        if entity_id is None:
            entity_id = record.id
        record_id = record.id
        region = record.region
    else:
        record_id = None

    event = AuditEvent(
        actor_id=actor_id,
        actor_role=actor_role,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        record_id=record_id,
        region=region,
        request_id=_current_request_id(),
        detail=detail,
    )
    db.add(event)
    return event
