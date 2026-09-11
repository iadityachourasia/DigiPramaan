"""
Real end-to-end auth round trip against the live Supabase project: login
with a real demo account, verify the returned token against a real
GET /auth/me call, confirm the profile matches.

Ensures its own required `profiles` row exists at the start rather than
assuming some earlier seed step already ran — this suite has no isolated
test database (see test_alembic_roundtrip.py's own docstring), so a
same-run neighbor (that file's downgrade/upgrade round trip) can legitimately
wipe all rows including the seeded demo profiles between test files. A test
that depends on another test file's side effect for its own data is a bug
waiting for the next reordering; this one is self-sufficient instead.

Skips (not fails) if INTEGRATION_TEST_EMAIL/PASSWORD aren't set — this is a
specific optional fixture credential, not general infrastructure
reachability, so the "must fail, not skip" rule that governs the other
integration tests (database, object storage, alembic) doesn't apply here in
the same way. Excluded from the default `pytest` run; run explicitly with
`pytest -m integration`.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import create_app

pytestmark = pytest.mark.integration


def _ensure_profile_exists(email: str) -> None:
    """Same lookup-by-email-then-upsert shape as app.seed.demo_profiles —
    duplicated in miniature here rather than imported, since this only
    needs one row to exist (any plausible role/department will do; the
    test asserts identity fields, not role-specific behavior)."""
    with SessionLocal() as db:
        auth_user = db.execute(
            text("SELECT id FROM auth.users WHERE email = :email"), {"email": email}
        ).first()
        if auth_user is None:
            pytest.skip(f"No Supabase Auth user for {email} — create it first.")

        db.execute(
            text(
                """
                INSERT INTO profiles
                    (id, username, email, full_name, role, department,
                     region, jurisdiction_level, jurisdiction_name)
                VALUES
                    (:id, :username, :email, 'Integration Test Fixture',
                     'Enforcement Officer', 'Department of Consumer Affairs',
                     'Maharashtra', 'State', 'Maharashtra')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": auth_user[0], "username": email.split("@")[0], "email": email},
        )
        db.commit()


def test_real_login_and_me_round_trip() -> None:
    settings = get_settings()
    if not settings.integration_test_email or not settings.integration_test_password:
        pytest.skip("INTEGRATION_TEST_EMAIL/PASSWORD not set in .env")

    _ensure_profile_exists(settings.integration_test_email)

    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "username": settings.integration_test_email,
                "password": settings.integration_test_password,
                "rememberMe": False,
            },
        )
        assert login_response.status_code == 200, login_response.text
        body = login_response.json()
        assert body["token"]
        assert body["user"]["email"] == settings.integration_test_email

        me_response = client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
        )
        assert me_response.status_code == 200
        assert me_response.json()["email"] == settings.integration_test_email


def test_real_refresh_round_trip() -> None:
    """WCAG 2.2.1's "Stay signed in" action, exercised against the real
    Supabase project: log in for a real refresh token, then exchange it for
    a new access token via POST /auth/refresh."""
    settings = get_settings()
    if not settings.integration_test_email or not settings.integration_test_password:
        pytest.skip("INTEGRATION_TEST_EMAIL/PASSWORD not set in .env")

    _ensure_profile_exists(settings.integration_test_email)

    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "username": settings.integration_test_email,
                "password": settings.integration_test_password,
                "rememberMe": False,
            },
        )
        assert login_response.status_code == 200, login_response.text
        refresh_token = login_response.json()["refreshToken"]
        assert refresh_token

        refresh_response = client.post(
            "/api/v1/auth/refresh", json={"refreshToken": refresh_token}
        )
        assert refresh_response.status_code == 200, refresh_response.text
        refreshed = refresh_response.json()
        assert refreshed["token"]
        assert refreshed["refreshToken"]
        assert refreshed["user"]["email"] == settings.integration_test_email

        # The new access token must itself be a real, usable session.
        me_response = client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {refreshed['token']}"}
        )
        assert me_response.status_code == 200


def test_real_invalid_refresh_token_is_rejected() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/auth/refresh", json={"refreshToken": "not-a-real-refresh-token"}
        )
        assert response.status_code == 401


def test_real_wrong_password_is_rejected() -> None:
    settings = get_settings()
    if not settings.integration_test_email:
        pytest.skip("INTEGRATION_TEST_EMAIL not set in .env")

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={
                "username": settings.integration_test_email,
                "password": "definitely-not-the-real-password",
                "rememberMe": False,
            },
        )
        assert response.status_code == 401


def test_real_invalid_bearer_token_is_rejected() -> None:
    with TestClient(create_app()) as client:
        response = client.get(
            "/api/v1/internal/whoami",
            headers={"Authorization": "Bearer this-is-not-a-real-token"},
        )
        assert response.status_code == 401
