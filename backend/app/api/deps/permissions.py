"""
deps/permissions.py — the Role Permission Matrix, ported verbatim from
src/types/user.ts's `ROLE_PERMISSIONS`/`can()`. The frontend's own copy
stays exactly what it is (a UI-gating convenience); this is the copy that
actually decides anything, server-side.

The server-side `profiles` row — role, region, jurisdiction_level,
jurisdiction_name — is the sole authority for all of this. Nothing here
ever reads a client-supplied role/region/jurisdiction from a query
parameter or request body.
"""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps.auth import get_current_user
from app.db.models import Profile

# Verbatim from src/types/user.ts — keep these two in sync by hand until a
# shared schema/codegen pipeline exists between the two languages.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "Enforcement Officer": frozenset(
        {
            "scan.create",
            "verification.confirm",
            "record.flagNeedsReview",
            "record.flagForEnforcement",
            "analytics.view",
            "report.generate",
        }
    ),
    "Admin": frozenset(
        {
            "scan.create",
            "verification.confirm",
            "record.flagNeedsReview",
            "record.flagForEnforcement",
            "record.archive",
            "record.bulkStatusChange",
            "analytics.view",
            "rules.manageThresholds",
            "report.generate",
            "activity.view",
        }
    ),
    "Reviewer": frozenset(
        {"record.flagNeedsReview", "analytics.view", "report.generate", "activity.view"}
    ),
}


def can(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def require_permission(permission: str) -> Callable[[Profile], Profile]:
    """Dependency factory: `Depends(require_permission("record.archive"))`.
    Returns the authenticated profile on success (so a route can still use
    it), raises 403 otherwise.
    """

    def _dependency(current_user: Profile = Depends(get_current_user)) -> Profile:
        if not can(current_user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' does not have permission '{permission}'",
            )
        return current_user

    return _dependency


def require_role(*roles: str) -> Callable[[Profile], Profile]:
    """Only for the rare case a check is about identity ('must be Admin')
    rather than a specific gated action — prefer require_permission for
    anything that maps to a real action in the permission matrix above.
    """

    def _dependency(current_user: Profile = Depends(get_current_user)) -> Profile:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not permitted for this action",
            )
        return current_user

    return _dependency


class Scope(BaseModel):
    """What the rest of the backend needs to jurisdiction-scope a query.
    Deliberately thin for the MVP — no Jurisdiction table, no hierarchy
    traversal yet (that's the long-term design's job) — just the profile's
    own flat fields, passed through as-is.
    """

    role: str
    region: str | None
    jurisdiction_level: str | None
    jurisdiction_name: str | None


def get_current_scope(current_user: Profile = Depends(get_current_user)) -> Scope:
    return Scope(
        role=current_user.role,
        region=current_user.region,
        jurisdiction_level=current_user.jurisdiction_level,
        jurisdiction_name=current_user.jurisdiction_name,
    )
