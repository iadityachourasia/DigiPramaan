"""
Unit tests for get_current_user(), exercised through the real
GET /internal/whoami endpoint (the full real wiring — bearer token -> JWT
verify -> profile load) rather than reimplementing the chain in the test.
verify_supabase_jwt and the DB session are both mocked so no real token or
database is needed.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import AuthError
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = "33333333-3333-3333-3333-333333333333"


def _fake_profile(**overrides):
    class _Profile:
        pass

    p = _Profile()
    p.id = uuid.UUID(TEST_USER_ID)
    p.role = overrides.get("role", "Admin")
    p.jurisdiction_level = overrides.get("jurisdiction_level", "National")
    p.region = overrides.get("region", None)
    if "active" in overrides:
        p.active = overrides["active"]
    return p


def _client_with_mock_db(mock_db: MagicMock) -> TestClient:
    app = create_app()

    # Must be a real generator function — see test_login_endpoint.py's
    # matching comment for why a bare `lambda: iter([mock_db])` silently
    # injects the iterator itself instead of mock_db.
    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


def test_missing_token_is_401() -> None:
    with _client_with_mock_db(MagicMock()) as client:
        response = client.get("/api/v1/internal/whoami")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_ERROR"


def test_invalid_token_is_401() -> None:
    with _client_with_mock_db(MagicMock()) as client, patch(
        "app.api.deps.auth.verify_supabase_jwt", side_effect=AuthError("Token signature is invalid")
    ):
        response = client.get(
            "/api/v1/internal/whoami", headers={"Authorization": "Bearer whatever"}
        )
    assert response.status_code == 401


def test_valid_token_with_profile_returns_200() -> None:
    mock_db = MagicMock()
    mock_db.get.return_value = _fake_profile()

    with _client_with_mock_db(mock_db) as client, patch(
        "app.api.deps.auth.verify_supabase_jwt", return_value={"sub": TEST_USER_ID}
    ):
        response = client.get(
            "/api/v1/internal/whoami", headers={"Authorization": "Bearer valid-looking-token"}
        )

    assert response.status_code == 200
    assert response.json() == {"id": TEST_USER_ID, "role": "Admin"}


def test_valid_token_but_no_matching_profile_is_401() -> None:
    mock_db = MagicMock()
    mock_db.get.return_value = None

    with _client_with_mock_db(mock_db) as client, patch(
        "app.api.deps.auth.verify_supabase_jwt", return_value={"sub": TEST_USER_ID}
    ):
        response = client.get(
            "/api/v1/internal/whoami", headers={"Authorization": "Bearer valid-looking-token"}
        )

    assert response.status_code == 401
    assert "profile" in response.json()["error"]["message"].lower()


def test_malformed_subject_claim_is_401() -> None:
    with _client_with_mock_db(MagicMock()) as client, patch(
        "app.api.deps.auth.verify_supabase_jwt", return_value={"sub": "not-a-uuid"}
    ):
        response = client.get(
            "/api/v1/internal/whoami", headers={"Authorization": "Bearer valid-looking-token"}
        )
    assert response.status_code == 401


# --------------------------------------------------------------------- #
# Phase 1.1 correction — fail-closed authentication. A profile that loads
# successfully but cannot produce a valid ViewerScope must be rejected with
# the SAME generic 401 as "no profile provisioned", never let through as an
# unscoped/National-equivalent viewer. See app/services/authz/viewer.py's
# own docstring on why each of these is rejected, and
# app/api/deps/auth.py::_resolve_profile for where that check now lives.
# --------------------------------------------------------------------- #


def _authenticate(profile) -> object:
    mock_db = MagicMock()
    mock_db.get.return_value = profile
    with _client_with_mock_db(mock_db) as client, patch(
        "app.api.deps.auth.verify_supabase_jwt", return_value={"sub": TEST_USER_ID}
    ):
        return client.get(
            "/api/v1/internal/whoami", headers={"Authorization": "Bearer valid-looking-token"}
        )


def test_missing_jurisdiction_level_is_401() -> None:
    profile = _fake_profile(jurisdiction_level=None)
    response = _authenticate(profile)
    assert response.status_code == 401
    # Never reveals which check failed — the identical message every other
    # authentication failure in this file uses.
    assert "profile" in response.json()["error"]["message"].lower()


def test_unknown_jurisdiction_level_is_401() -> None:
    profile = _fake_profile(jurisdiction_level="District")
    response = _authenticate(profile)
    assert response.status_code == 401


def test_state_with_null_region_is_401() -> None:
    profile = _fake_profile(jurisdiction_level="State", region=None)
    response = _authenticate(profile)
    assert response.status_code == 401


def test_state_with_empty_region_is_401() -> None:
    profile = _fake_profile(jurisdiction_level="State", region="")
    response = _authenticate(profile)
    assert response.status_code == 401


def test_unknown_role_is_401() -> None:
    profile = _fake_profile(role="Superuser")
    response = _authenticate(profile)
    assert response.status_code == 401


def test_inactive_profile_is_401() -> None:
    profile = _fake_profile(active=False)
    response = _authenticate(profile)
    assert response.status_code == 401


def test_valid_national_profile_authenticates() -> None:
    profile = _fake_profile(jurisdiction_level="National", region=None)
    response = _authenticate(profile)
    assert response.status_code == 200


def test_valid_state_profile_authenticates() -> None:
    profile = _fake_profile(role="Enforcement Officer", jurisdiction_level="State", region="Maharashtra")
    response = _authenticate(profile)
    assert response.status_code == 200
