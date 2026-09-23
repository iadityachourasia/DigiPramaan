"""
scope.py — the one server-side jurisdiction-scoping choke point for Phase 4
intelligence reads (Product DNA, Company Compliance Profile, case listing,
and the live-recomputed risk summary), and for the Records list.

Phase 1.1 correction: this used to fail OPEN (no filter at all) for a
`None`/unrecognized jurisdiction_level, on the theory that it matched the
frontend's own "unscoped" convention. That is exactly the F-001 gap —
a malformed or incompletely-provisioned profile must never see everything.
`apply_officer_scope` now delegates to the SAME fail-closed
`ViewerScope`/`record_visibility_filter` pair every object-level lookup in
`services/authz/repositories.py` is built from — there is exactly one
definition of "what may this viewer see," not one per caller. A profile
that cannot produce a valid `ViewerScope` sees zero rows, never every row —
in practice this path is already unreachable in a real request (`get_
current_user` now rejects such a profile at authentication time), but a
query-building function has no HTTP response to raise, so it fails to
`sa_false()` rather than silently returning an unfiltered query.
"""

from __future__ import annotations

import uuid

from sqlalchemy import false as sa_false
from sqlalchemy.orm import Query

from app.db.models import ComplianceRecord, Profile
from app.services.authz.repositories import record_visibility_filter
from app.services.authz.viewer import InvalidViewerProfile, ViewerScope

# A stable, deterministic namespace-derived id standing in for a real
# Jurisdiction row's id (none exists server-side yet) — same derivation
# pattern as core/ids.py's derive_record_id.
_JURISDICTION_ID_NAMESPACE = uuid.NAMESPACE_URL


def region_jurisdiction_id(region: str) -> uuid.UUID:
    return uuid.uuid5(_JURISDICTION_ID_NAMESPACE, f"region:{region}")


def apply_officer_scope(query: Query, current_user: Profile) -> Query:
    """Filters a query already selecting/joining ComplianceRecord down to
    what `current_user` may see, via the same fail-closed predicate every
    object-level lookup uses (see module docstring)."""
    try:
        viewer = ViewerScope.from_profile(current_user)
    except InvalidViewerProfile:
        return query.filter(sa_false())
    return record_visibility_filter(query, viewer)
