"""
Unit tests for the Role Permission Matrix — both the pure `can()` function
(a direct port-accuracy check against src/types/user.ts's own matrix) and
`require_permission()`'s actual 200/403 behavior wired into a real FastAPI
route, with `get_current_user` overridden to avoid needing a real token.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.api.deps.permissions import ROLE_PERMISSIONS, Scope, can, get_current_scope, require_permission
from app.main import create_app


def _fake_profile(role: str, **overrides):
    class _Profile:
        id = uuid.uuid4()

    p = _Profile()
    p.role = role
    p.region = overrides.get("region", "Maharashtra")
    p.jurisdiction_level = overrides.get("jurisdiction_level", "State")
    p.jurisdiction_name = overrides.get("jurisdiction_name", "Maharashtra")
    return p


@pytest.mark.parametrize(
    ("role", "permission", "expected"),
    [
        ("Enforcement Officer", "scan.create", True),
        ("Enforcement Officer", "record.archive", False),
        ("Enforcement Officer", "activity.view", False),
        ("Admin", "record.archive", True),
        ("Admin", "activity.view", True),
        ("Admin", "rules.manageThresholds", True),
        ("Reviewer", "record.flagNeedsReview", True),
        ("Reviewer", "activity.view", True),
        ("Reviewer", "scan.create", False),
        ("Reviewer", "verification.confirm", False),
        ("Unknown Role", "scan.create", False),
    ],
)
def test_can_matches_ported_matrix(role: str, permission: str, expected: bool) -> None:
    assert can(role, permission) is expected


def test_matrix_has_exactly_the_three_roles() -> None:
    assert set(ROLE_PERMISSIONS.keys()) == {"Enforcement Officer", "Admin", "Reviewer"}


def test_admin_has_all_ten_permissions() -> None:
    all_permissions = {p for perms in ROLE_PERMISSIONS.values() for p in perms}
    assert ROLE_PERMISSIONS["Admin"] == frozenset(all_permissions)
    assert len(all_permissions) == 10


def _build_test_app(role: str) -> TestClient:
    # Uses the real app (with its real exception handlers/error envelope)
    # rather than a bare FastAPI() — a bare app wouldn't have
    # register_exception_handlers wired, so a 403 would come back as
    # FastAPI's default {"detail": ...} shape instead of our real envelope.
    app = create_app()

    @app.get("/gated")
    def gated(current_user=Depends(require_permission("record.archive"))) -> dict:
        return {"ok": True}

    app.dependency_overrides[get_current_user] = lambda: _fake_profile(role)
    return TestClient(app)


def test_require_permission_allows_when_role_has_it() -> None:
    client = _build_test_app("Admin")
    response = client.get("/gated")
    assert response.status_code == 200


def test_require_permission_denies_when_role_lacks_it() -> None:
    client = _build_test_app("Enforcement Officer")
    response = client.get("/gated")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTHORIZATION_ERROR"


def test_get_current_scope_derives_from_the_authenticated_profile() -> None:
    profile = _fake_profile(
        "Enforcement Officer",
        region="Maharashtra",
        jurisdiction_level="State",
        jurisdiction_name="Maharashtra",
    )
    scope = get_current_scope(current_user=profile)
    assert scope == Scope(
        role="Enforcement Officer",
        region="Maharashtra",
        jurisdiction_level="State",
        jurisdiction_name="Maharashtra",
    )


def test_get_current_scope_never_reads_client_supplied_values() -> None:
    # The only input is the authenticated profile object itself — there is
    # no code path here that could accept a query-parameter override.
    import inspect

    signature = inspect.signature(get_current_scope)
    assert list(signature.parameters.keys()) == ["current_user"]
