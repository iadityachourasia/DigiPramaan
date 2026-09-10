"""
scope.py — the one server-side jurisdiction-scoping choke point for Phase 4
intelligence reads (Product DNA, Company Compliance Profile, case listing,
and the live-recomputed risk summary). Mirrors the frontend's own
`scopeRecordsForViewer` (src/lib/server/scan-pipeline-store.ts) exactly:
region filter unless the viewer's jurisdiction is National (or unset), then
an Enforcement Officer is additionally restricted to records assigned to
them specifically. No real Jurisdiction table exists server-side yet (see
Profile — jurisdiction_level/region are flat strings, not a normalized
hierarchy), so this stays a direct field comparison, same as the frontend.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Query

from app.db.models import ComplianceRecord, Profile

# A stable, deterministic namespace-derived id standing in for a real
# Jurisdiction row's id (none exists server-side yet) — same derivation
# pattern as core/ids.py's derive_record_id.
_JURISDICTION_ID_NAMESPACE = uuid.NAMESPACE_URL


def region_jurisdiction_id(region: str) -> uuid.UUID:
    return uuid.uuid5(_JURISDICTION_ID_NAMESPACE, f"region:{region}")


def apply_officer_scope(query: Query, current_user: Profile) -> Query:
    """Filters a query already selecting/joining ComplianceRecord down to
    what `current_user` may see. Fail-open (no filter) for National or an
    unset jurisdiction_level — matches the frontend's own
    `regionNamesVisibleTo(...) === null` "unscoped" convention exactly,
    rather than inventing a stricter server-side default that would
    silently diverge from the UI's own stated behavior."""
    if current_user.jurisdiction_level not in (None, "National") and current_user.region:
        query = query.filter(ComplianceRecord.region == current_user.region)
    if current_user.role == "Enforcement Officer":
        query = query.filter(ComplianceRecord.assigned_officer_id == current_user.id)
    return query
