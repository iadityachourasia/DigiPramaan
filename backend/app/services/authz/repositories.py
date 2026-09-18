"""
services/authz/repositories.py — the ONE place a protected object
(a compliance record, scan session, case, e-commerce batch) is loaded by
id for anything beyond a collection listing.

Every function here raises the SAME `HTTPException(404)` whether the id
does not exist at all or exists but is not visible to this viewer — a
probe cannot distinguish "wrong scope" from "does not exist" (F-001's own
acceptance criterion). None of these functions ever accept an id, region,
or role from anywhere but the already-authenticated `Profile` and the
route's own path parameter — never a query string or request body field.

`record_visibility_filter` is the single predicate every function here
(and `services/scope.py::apply_officer_scope`, which wraps it for
collection-listing callers) is built from — there is exactly one
implementation of "what may this viewer see," not one per object type.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from app.db.models import ComplianceRecord, EcommerceBatch, Profile, ScanSession, ViolationCase
from app.services.authz.viewer import InvalidViewerProfile, ViewerScope


def _record_not_found() -> HTTPException:
    # A fresh instance per raise — HTTPException carries no per-request
    # state, but a shared module-level instance would still be an easy
    # footgun to reuse incorrectly later (e.g. attaching request-specific
    # headers to it). Cheap enough to construct each time.
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _resolve_viewer(current_user: Profile) -> ViewerScope | None:
    """None (never raises) when `current_user` cannot produce a valid
    ViewerScope. In a real request this cannot happen — `get_current_user`
    (api/deps/auth.py) already rejects such a profile at authentication
    time — so this is defense-in-depth, not the primary gate. Callers
    treat None as "nothing is visible", never as "everything is visible"."""
    try:
        return ViewerScope.from_profile(current_user)
    except InvalidViewerProfile:
        return None


def record_visibility_filter(query: Query, viewer: ViewerScope) -> Query:
    """Filters a query already selecting/joining `ComplianceRecord` down to
    what `viewer` may see. National sees every region; a State viewer sees
    only their own region. An Enforcement Officer is ADDITIONALLY
    restricted to records assigned to them specifically, regardless of
    jurisdiction level — matches 13-history-and-hierarchy.md §4.2's own
    "an Officer sees their own cases" rule and the frontend's identical
    `scopeRecordsForViewer` (src/lib/server/scan-pipeline-store.ts)."""
    if not viewer.is_national:
        query = query.filter(ComplianceRecord.region == viewer.region)
    if viewer.is_enforcement_officer:
        query = query.filter(ComplianceRecord.assigned_officer_id == viewer.profile_id)
    return query


def get_visible_record(
    db: Session, record_id: uuid.UUID, current_user: Profile, *, for_update: bool = False
) -> ComplianceRecord:
    """Raises 404 (never 403) for a nonexistent id, an out-of-scope id, or
    an invalid viewer profile. `for_update=True` takes a row lock
    (`SELECT ... FOR UPDATE`) for the caller's own mutating transaction —
    every write endpoint (corrections, resolutions, calibration, verify,
    flag-enforcement, retry-enrichment) should pass it."""
    viewer = _resolve_viewer(current_user)
    if viewer is None:
        raise _record_not_found()

    query = db.query(ComplianceRecord).filter(ComplianceRecord.id == record_id)
    query = record_visibility_filter(query, viewer)
    if for_update:
        query = query.with_for_update()
    record = query.first()
    if record is None:
        raise _record_not_found()
    return record


def get_visible_scan_session(db: Session, scan_id: uuid.UUID, current_user: Profile) -> ScanSession:
    """A scan session's own `region`/`created_by` are the visibility
    facts — never the record it eventually produces (which may not exist
    yet while OCR/structuring are still running). `created_by` always
    grants visibility, regardless of role or region: an officer can always
    see the draft scan they themselves started. Beyond the creator, an
    Enforcement Officer sees nothing (matches the record-level rule: an EO
    only ever sees their OWN work, never a colleague's, before or after a
    record exists) and a National/State non-EO viewer sees it if their
    scope covers the scan's own region (a null region — Mobile Handoff's
    pending-capture scans before the officer's own Details step — is
    visible only to its own creator, never to a State viewer with nothing
    to match)."""
    viewer = _resolve_viewer(current_user)
    if viewer is None:
        raise _record_not_found()

    session = db.get(ScanSession, scan_id)
    if session is None:
        raise _record_not_found()

    if session.created_by == viewer.profile_id:
        return session
    if viewer.is_enforcement_officer:
        raise _record_not_found()
    if viewer.is_national:
        return session
    if session.region is not None and session.region == viewer.region:
        return session
    raise _record_not_found()


def get_visible_case(
    db: Session, case_id: uuid.UUID, current_user: Profile, *, for_update: bool = False
) -> ViolationCase:
    """A case's visibility follows its originating record's — one JOIN,
    the same `record_visibility_filter` predicate every other record-
    scoped lookup uses, so a case can never be visible when its own
    record is not. `for_update=True` locks the case row for a caller's
    own mutating transaction (e.g. a status transition)."""
    viewer = _resolve_viewer(current_user)
    if viewer is None:
        raise _record_not_found()

    query = (
        db.query(ViolationCase)
        .join(ComplianceRecord, ComplianceRecord.id == ViolationCase.originating_record_id)
        .filter(ViolationCase.id == case_id)
    )
    query = record_visibility_filter(query, viewer)
    if for_update:
        query = query.with_for_update()
    case = query.first()
    if case is None:
        raise _record_not_found()
    return case


def get_visible_batch(db: Session, batch_id: uuid.UUID, current_user: Profile) -> EcommerceBatch:
    """`EcommerceBatch` carries no region or assigned-officer field of its
    own (see db/models/scan.py — it is only ever the category/search page
    a batch of independent scans came from). Visible to its own creator,
    or to any National viewer; a State viewer who did not create it sees
    nothing — there is no per-batch region to match against, so the safe
    default is creator-only rather than guessing at one from the batch's
    child scan sessions (which may span several)."""
    viewer = _resolve_viewer(current_user)
    if viewer is None:
        raise _record_not_found()

    batch = db.get(EcommerceBatch, batch_id)
    if batch is None:
        raise _record_not_found()
    if batch.created_by == viewer.profile_id or viewer.is_national:
        return batch
    raise _record_not_found()
