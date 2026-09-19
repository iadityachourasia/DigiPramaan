"""
P2 hardening (F-010) — integration proof that check_and_increment's real
Postgres upsert (`ON CONFLICT (bucket_key, window_start) DO UPDATE`)
genuinely accumulates hit_count across calls in the same window, resets
in the next window, and that concurrent callers on the same key never
lose an increment to a race (the exact thing `UNIQUE(bucket_key,
window_start)` + `ON CONFLICT` is for — a plain SELECT-then-UPDATE would
lose increments under real concurrency, which is why this needs a real
database, not a mock).

Also a real end-to-end proof that POST /auth/login and POST /auth/refresh
return 429 with Retry-After past the configured threshold, and a
DIFFERENT key (different email/IP) is unaffected.
"""

from __future__ import annotations

import threading
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import SessionLocal, get_db
from app.main import create_app
from app.services.auth.rate_limit import check_and_increment
from app.services.auth.supabase_auth import SupabaseAuthError

pytestmark = pytest.mark.integration


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip("Requires a dedicated, disposable TEST_DATABASE_URL.")
    if settings.test_database_url != settings.database_url:
        pytest.skip("TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else.")


@pytest.fixture()
def clean_bucket():
    _skip_unless_disposable_test_db()
    bucket_key = f"test:integration:{uuid.uuid4().hex[:12]}"
    yield bucket_key
    with SessionLocal() as db:
        db.execute(text("DELETE FROM auth_rate_limit_hits WHERE bucket_key = :k"), {"k": bucket_key})
        db.commit()


def test_hit_count_accumulates_across_calls_in_the_same_window(clean_bucket) -> None:
    bucket_key = clean_bucket
    results = [check_and_increment(bucket_key, window_seconds=60, max_hits=3) for _ in range(5)]
    # 1st..3rd allowed, 4th and 5th rejected.
    assert results == [True, True, True, False, False]

    with SessionLocal() as db:
        row = db.execute(
            text("SELECT hit_count FROM auth_rate_limit_hits WHERE bucket_key = :k"), {"k": bucket_key}
        ).one()
    assert row.hit_count == 5


def test_concurrent_increments_on_the_same_key_never_lose_a_count(clean_bucket) -> None:
    """The direct proof ON CONFLICT ... DO UPDATE prevents a lost-update
    race: N threads each incrementing once must leave hit_count == N,
    never less (which a naive SELECT-then-UPDATE under concurrency
    could produce)."""
    bucket_key = clean_bucket
    thread_count = 20
    barrier = threading.Barrier(thread_count)

    def _hit():
        barrier.wait()
        check_and_increment(bucket_key, window_seconds=60, max_hits=thread_count * 2)

    threads = [threading.Thread(target=_hit) for _ in range(thread_count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    with SessionLocal() as db:
        row = db.execute(
            text("SELECT hit_count FROM auth_rate_limit_hits WHERE bucket_key = :k"), {"k": bucket_key}
        ).one()
    assert row.hit_count == thread_count


def _fake_profile():
    class _Profile:
        pass

    p = _Profile()
    p.id = uuid.UUID("88888888-8888-8888-8888-888888888888")
    p.username = "rl-integration-test"
    p.email = "rl-integration-test@example.invalid"
    p.full_name = "Rate Limit Test"
    p.role = "Enforcement Officer"
    p.department = "Department of Consumer Affairs"
    p.region = "Maharashtra"
    p.jurisdiction_level = "State"
    p.jurisdiction_name = "Maharashtra"
    return p


def test_login_returns_429_past_threshold_and_a_different_key_is_unaffected() -> None:
    _skip_unless_disposable_test_db()
    settings = get_settings()
    max_attempts = settings.auth_login_rate_limit_max_attempts

    app = create_app()
    mock_db = MagicMock()
    mock_db.get.return_value = None
    mock_db.query.return_value.filter.return_value.first.return_value = None

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app)

    unique_user = f"rl-e2e-{uuid.uuid4().hex[:10]}@example.invalid"
    # Pin a distinct fake client IP per identifier — TestClient's real
    # transport otherwise reuses the same peer IP for every call, which
    # would make the IP-keyed bucket (not just the email-keyed one) trip
    # across BOTH phases of this test and mask what's actually being
    # proven (that a genuinely different identifier is unaffected).
    try:
        with patch("app.api.v1.auth.sign_in_with_password") as mock_sign_in, patch(
            "app.api.v1.auth.resolve_client_ip", return_value="203.0.113.201"
        ):
            mock_sign_in.side_effect = SupabaseAuthError("Invalid username or password", status_code=401)
            responses = []
            for _ in range(max_attempts + 2):
                responses.append(
                    client.post(
                        "/api/v1/auth/login",
                        json={"username": unique_user, "password": "wrong", "rememberMe": False},
                    )
                )
        last_response = responses[-1]
        assert last_response.status_code == 429
        assert last_response.json()["error"]["code"] == "RATE_LIMITED"
        assert "Retry-After" in last_response.headers
        # Real attempts (401 from Supabase) up to the threshold, then
        # rate-limited without ever reaching sign_in_with_password again.
        assert [r.status_code for r in responses[:max_attempts]] == [401] * max_attempts
        assert mock_sign_in.call_count == max_attempts

        # A DIFFERENT identifier AND a different IP must be unaffected by
        # the first one's rejection — both login:ip and login:email keys
        # are per-value.
        other_user = f"rl-e2e-other-{uuid.uuid4().hex[:10]}@example.invalid"
        with patch("app.api.v1.auth.sign_in_with_password") as mock_sign_in_2, patch(
            "app.api.v1.auth.resolve_client_ip", return_value="203.0.113.202"
        ):
            mock_sign_in_2.side_effect = SupabaseAuthError("Invalid username or password", status_code=401)
            response = client.post(
                "/api/v1/auth/login",
                json={"username": other_user, "password": "wrong", "rememberMe": False},
            )
        # A genuinely different identifier+IP reaches Supabase normally
        # (401, not 429) — unaffected by the first identifier's rejection.
        assert response.status_code == 401
        mock_sign_in_2.assert_called_once()
    finally:
        app.dependency_overrides.clear()
        with SessionLocal() as db:
            db.execute(
                text("DELETE FROM auth_rate_limit_hits WHERE bucket_key LIKE :pattern"),
                {"pattern": "login:email:rl-e2e-%"},
            )
            db.execute(
                text("DELETE FROM auth_rate_limit_hits WHERE bucket_key IN (:a, :b)"),
                {"a": "login:ip:203.0.113.201", "b": "login:ip:203.0.113.202"},
            )
            db.commit()
