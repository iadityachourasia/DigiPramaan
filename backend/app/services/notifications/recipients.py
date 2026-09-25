"""
services/notifications/recipients.py — resolving "everyone who should know
about this" for the two broadcast notification triggers.

Mirrors `api/v1/admin.py`'s own `_admin_scope_profiles()` (Admin Console's
"which profiles is this admin allowed to see" query) and
`ViewerScope`/`apply_officer_scope`'s National-vs-region rule generally —
just run in the opposite direction: instead of "what can this viewer see",
it's "which profiles' jurisdiction covers this region".
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models import Profile


def jurisdiction_recipients(db: Session, region: str | None, roles: list[str]) -> set[uuid.UUID]:
    """Active profiles with one of `roles` whose jurisdiction covers
    `region`. `region=None` means "no region scoping at all" — used for
    genuinely system-wide events (rule thresholds have no per-region
    scope), not "match nothing". A National-jurisdiction profile always
    matches any given region; a State-jurisdiction profile matches only
    its own region.
    """
    query = db.query(Profile.id).filter(Profile.active.is_(True)).filter(Profile.role.in_(roles))
    if region is not None:
        query = query.filter(
            (Profile.jurisdiction_level == "National") | (Profile.region == region)
        )
    return {row[0] for row in query.all()}
