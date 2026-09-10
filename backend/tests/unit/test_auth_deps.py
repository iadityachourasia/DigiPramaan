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


def _fake_profile():
    class _Profile:
        pass

    p = _Profile()
    p.id = uuid.UUID(TEST_USER_ID)
    p.role = "Admin"
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
