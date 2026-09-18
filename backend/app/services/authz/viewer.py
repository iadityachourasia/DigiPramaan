"""
services/authz/viewer.py — ViewerScope, the fail-closed authenticated-
identity type every object-visibility check in `repositories.py` is built
on.

WHY A SEPARATE TYPE FROM `Profile`
------------------------------------
`Profile` (db/models/user_profile.py) is a database row: `region` and
`jurisdiction_level` are nullable columns because the schema has to admit
an incompletely-provisioned account. `ViewerScope` is the opposite — a
value that, once constructed, is GUARANTEED to describe a viewer whose
jurisdiction can be resolved to an explicit predicate. There is no
"unscoped because we don't know" state in `ViewerScope`; there is only
`National` (explicit, sees everything) and `State` with a real, non-empty
`region` (explicit, scoped to that region). Nothing about a `ViewerScope`
is ever inferred from an absent value.

THE FAIL-CLOSED DIRECTION, STATED ONCE
------------------------------------------
`services/scope.py::apply_officer_scope` (pre-existing) treats
`jurisdiction_level` outside `(None, "National")` as the ONLY scoped case
— a `None` level, or a `"State"` level with an empty `region`, both fall
through to "no filter applied", i.e. see everything. That is the exact
authorization gap this module closes: `ViewerScope.from_profile` REJECTS
(raises `InvalidViewerProfile`) a profile that would have hit either of
those two fall-through cases, rather than letting it reach a query as an
implicitly-unscoped viewer. `api/deps/auth.py` maps that rejection to a
generic 401 — an incomplete profile cannot authenticate at all until an
Admin repairs it (see api/v1/admin.py, Phase 1.5), which is the documented,
intentional trade-off: a real gap in a profile's jurisdiction data must
never silently resolve to "can see everything."

`active` IS FORWARD-COMPATIBLE, NOT YET A REAL COLUMN
----------------------------------------------------------
`Profile` gains a real `active` column in Phase 1.5 (the Admin Console's
deactivate flow). This module reads it via `getattr(profile, "active",
True)` so the exact same check already fail-closes once that column
exists, with no further change here — a `Profile` today, with no `active`
attribute at all, reads as active by construction.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel


# Verbatim from api/deps/permissions.py's `ROLE_PERMISSIONS` keys — NOT
# imported from there, to avoid a real import cycle (api/deps/permissions.py
# already imports api/deps/auth.py, which is about to import this module).
# Kept in sync by hand, the same "duplicated across a language/module
# boundary, documented rather than hidden" discipline this codebase already
# applies to ROLE_PERMISSIONS existing in both src/types/user.ts and
# api/deps/permissions.py.
VALID_ROLES = frozenset({"Enforcement Officer", "Admin", "Reviewer"})

JurisdictionLevel = Literal["National", "State"]


class InvalidViewerProfile(Exception):
    """Raised by `ViewerScope.from_profile` for any profile that cannot
    produce an unambiguous jurisdiction predicate — deactivated, an
    unrecognized role, a missing/unrecognized jurisdiction_level, or a
    State-level profile with no region. Deliberately ONE exception type
    for every reason (never distinguished in the response the caller
    builds) — the caller (api/deps/auth.py) maps this to a single generic
    401, the same "never leak which specific check failed" discipline
    services/ecommerce/ssrf_guard.py's UnsafeUrlError already documents."""


class ViewerScope(BaseModel):
    """The validated, minimal identity `repositories.py` scopes a query or
    object lookup against. Immutable once constructed — nothing here is
    mutated after `from_profile` builds it."""

    model_config = {"frozen": True}

    profile_id: uuid.UUID
    role: str
    jurisdiction_level: JurisdictionLevel
    # Always a non-empty string when jurisdiction_level == "State" — never
    # None, never empty. Always None when jurisdiction_level == "National"
    # (an explicit National viewer's own posted region, if any, is not a
    # scoping fact).
    region: str | None

    @property
    def is_national(self) -> bool:
        return self.jurisdiction_level == "National"

    @property
    def is_enforcement_officer(self) -> bool:
        return self.role == "Enforcement Officer"

    @classmethod
    def from_profile(cls, profile) -> "ViewerScope":
        if not getattr(profile, "active", True):
            raise InvalidViewerProfile("Account is deactivated")

        role = getattr(profile, "role", None)
        if role not in VALID_ROLES:
            raise InvalidViewerProfile(f"Unrecognized role: {role!r}")

        jurisdiction_level = getattr(profile, "jurisdiction_level", None)
        if jurisdiction_level not in ("National", "State"):
            raise InvalidViewerProfile(
                f"jurisdiction_level must be explicitly 'National' or 'State', got {jurisdiction_level!r}"
            )

        region = getattr(profile, "region", None)
        if jurisdiction_level == "State":
            if not region:
                raise InvalidViewerProfile("A State-level profile must have a non-empty region")
        else:
            # National carries no scoping region, regardless of what the
            # row's own `region` column happens to hold (a National
            # profile's `region` is informational — a posting, not a
            # jurisdiction boundary).
            region = None

        return cls(
            profile_id=profile.id,
            role=role,
            jurisdiction_level=jurisdiction_level,
            region=region,
        )
