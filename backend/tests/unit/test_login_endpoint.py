"""
Unit tests for POST /auth/login and GET /auth/me. Mocks
sign_in_with_password (no real network call to Supabase) and overrides
get_db with a stubbed session — the live version of this flow, against a
real Supabase project, is tests/integration/test_auth_live.py.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import create_app
from app.services.auth.supabase_auth import SupabaseAuthError

TEST_USER_ID = "22222222-2222-2222-2222-222222222222"


def _fake_profile(**overrides):
    class _Profile:
        pass

    p = _Profile()
    p.id = uuid.UUID(TEST_USER_ID)
    p.username = "inspector"
    p.email = "inspector@dp.com"
    p.full_name = "Field Inspector"
    p.role = "Enforcement Officer"
    p.department = "Department of Consumer Affairs"
    p.region = "Maharashtra"
    p.jurisdiction_level = "State"
    p.jurisdiction_name = "Maharashtra"
    for key, value in overrides.items():
        setattr(p, key, value)
    return p


@pytest.fixture()
def client_with_db(request) -> tuple[TestClient, MagicMock]:
    app = create_app()
    mock_db = MagicMock()

    # Must be an actual generator FUNCTION, matching get_db's own shape —
    # FastAPI only applies yield-dependency semantics (calling next() on the
    # result) when it detects the override itself is a generator function.
    # A plain `lambda: iter([mock_db])` returns an iterator object that
    # FastAPI would inject AS THE VALUE, not iterate — a real bug this
    # exact test suite caught on its first run.
    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c, mock_db
    app.dependency_overrides.clear()


def test_login_success_returns_session_shape(client_with_db) -> None:
    client, mock_db = client_with_db
    mock_db.get.return_value = _fake_profile()

    with patch(
        "app.api.v1.auth.sign_in_with_password",
        return_value={
            "access_token": "fake-access-token",
            "refresh_token": "fake-refresh-token",
            "expires_at": 9999999999,
            "user": {"id": TEST_USER_ID, "email": "inspector@dp.com"},
        },
    ):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "inspector@dp.com", "password": "correct-password", "rememberMe": False},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["token"] == "fake-access-token"
    assert body["refreshToken"] == "fake-refresh-token"
    assert body["user"]["role"] == "Enforcement Officer"
    assert body["user"]["fullName"] == "Field Inspector"
    assert "expiresAt" in body


def test_login_wrong_credentials_returns_401(client_with_db) -> None:
    client, _mock_db = client_with_db

    with patch(
        "app.api.v1.auth.sign_in_with_password",
        side_effect=SupabaseAuthError("Invalid username or password", status_code=401),
    ):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "inspector@dp.com", "password": "wrong", "rememberMe": False},
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_ERROR"


def test_login_unknown_username_returns_401_without_calling_supabase(client_with_db) -> None:
    client, mock_db = client_with_db
    mock_db.query.return_value.filter.return_value.first.return_value = None

    with patch("app.api.v1.auth.sign_in_with_password") as mock_sign_in:
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "no-such-user", "password": "x", "rememberMe": False},
        )

    assert response.status_code == 401
    # A username that resolves to nothing locally must never even reach
    # Supabase — there's no email to send it.
    mock_sign_in.assert_not_called()


def test_refresh_success_returns_new_session_shape(client_with_db) -> None:
    client, mock_db = client_with_db
    mock_db.get.return_value = _fake_profile()

    with patch(
        "app.api.v1.auth.refresh_access_token",
        return_value={
            "access_token": "new-access-token",
            "refresh_token": "new-refresh-token",
            "expires_at": 9999999999,
            "user": {"id": TEST_USER_ID, "email": "inspector@dp.com"},
        },
    ) as mock_refresh:
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": "old-refresh-token"},
        )

    mock_refresh.assert_called_once()
    assert mock_refresh.call_args[0][0] == "old-refresh-token"
    assert response.status_code == 200
    body = response.json()
    assert body["token"] == "new-access-token"
    assert body["refreshToken"] == "new-refresh-token"
    assert body["user"]["role"] == "Enforcement Officer"


def test_refresh_invalid_token_returns_401(client_with_db) -> None:
    client, _mock_db = client_with_db

    with patch(
        "app.api.v1.auth.refresh_access_token",
        side_effect=SupabaseAuthError("Session could not be refreshed", status_code=401),
    ):
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": "expired-or-invalid"},
        )

    assert response.status_code == 401


def test_refresh_service_unavailable_returns_503(client_with_db) -> None:
    client, _mock_db = client_with_db

    with patch(
        "app.api.v1.auth.refresh_access_token",
        side_effect=SupabaseAuthError("Could not reach the authentication service", status_code=503),
    ):
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": "whatever"},
        )

    assert response.status_code == 503


def test_login_authenticated_but_no_profile_returns_401(client_with_db) -> None:
    client, mock_db = client_with_db
    mock_db.get.return_value = None  # Supabase says yes, but we have no profile for them

    with patch(
        "app.api.v1.auth.sign_in_with_password",
        return_value={
            "access_token": "fake-access-token",
            "expires_at": 9999999999,
            "user": {"id": TEST_USER_ID, "email": "ghost@dp.com"},
        },
    ):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "ghost@dp.com", "password": "whatever", "rememberMe": False},
        )

    assert response.status_code == 401
    assert "profile" in response.json()["error"]["message"].lower()
