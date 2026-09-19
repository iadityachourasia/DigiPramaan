"""
Unit test proving POST /auth/login and POST /auth/refresh actually 429
when the rate limiter says no — the real route-level wiring, not just
rate_limit.py's own internal logic (see test_rate_limit.py) or the
"always allowed" default the rest of test_login_endpoint.py assumes.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = "22222222-2222-2222-2222-222222222222"


def _client_with_db() -> tuple[TestClient, MagicMock]:
    app = create_app()
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app), mock_db


def test_login_returns_429_with_retry_after_when_rate_limited() -> None:
    client, mock_db = _client_with_db()
    with patch("app.api.v1.auth.check_and_increment", return_value=False), patch(
        "app.api.v1.auth.sign_in_with_password"
    ) as mock_sign_in:
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "inspector@dp.com", "password": "x", "rememberMe": False},
        )

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert "Retry-After" in response.headers
    # Rate-limited before Supabase is ever called.
    mock_sign_in.assert_not_called()
    # One AuditEvent added for the rejection.
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


def test_refresh_returns_429_when_rate_limited() -> None:
    client, mock_db = _client_with_db()
    with patch("app.api.v1.auth.check_and_increment", return_value=False), patch(
        "app.api.v1.auth.refresh_access_token"
    ) as mock_refresh:
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": "whatever"},
        )

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    mock_refresh.assert_not_called()


def test_login_not_rate_limited_reaches_supabase_normally() -> None:
    """Confirms the rate-limit check happens for BOTH the login:ip and
    login:email keys — real login flow still works when neither trips."""
    client, mock_db = _client_with_db()
    from app.services.auth.supabase_auth import SupabaseAuthError

    with patch("app.api.v1.auth.check_and_increment", return_value=True) as mock_check, patch(
        "app.api.v1.auth.sign_in_with_password",
        side_effect=SupabaseAuthError("Invalid username or password", status_code=401),
    ):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "inspector@dp.com", "password": "wrong", "rememberMe": False},
        )

    assert response.status_code == 401
    assert mock_check.call_count == 2  # login:ip:... and login:email:...
