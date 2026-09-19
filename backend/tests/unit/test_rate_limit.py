"""
Unit tests for app/services/auth/rate_limit.py (P2 hardening, F-010) —
the pure window-truncation logic and the True/False threshold mapping,
mocking `SessionLocal` so no real Postgres is touched. The real upsert
semantics (ON CONFLICT ... DO UPDATE against a genuinely concurrent
race) are covered by tests/integration/test_auth_rate_limit_integration.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.services.auth.rate_limit import _window_start, check_and_increment


def test_window_start_truncates_to_the_configured_boundary() -> None:
    # 12:00:37 UTC with a 60s window -> truncates to 12:00:00.
    now = datetime(2026, 9, 19, 12, 0, 37, tzinfo=timezone.utc)
    window = _window_start(now, window_seconds=60)
    assert window == datetime(2026, 9, 19, 12, 0, 0, tzinfo=timezone.utc)


def test_window_start_is_stable_within_the_same_window() -> None:
    window_seconds = 60
    t1 = datetime(2026, 9, 19, 12, 0, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 9, 19, 12, 0, 59, tzinfo=timezone.utc)
    assert _window_start(t1, window_seconds) == _window_start(t2, window_seconds)


def test_window_start_advances_across_a_boundary() -> None:
    window_seconds = 60
    t1 = datetime(2026, 9, 19, 12, 0, 59, tzinfo=timezone.utc)
    t2 = datetime(2026, 9, 19, 12, 1, 0, tzinfo=timezone.utc)
    assert _window_start(t1, window_seconds) != _window_start(t2, window_seconds)


def _mock_session_local_returning(hit_count: int):
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = hit_count
    mock_session.execute.return_value = mock_result
    mock_session_local = MagicMock()
    mock_session_local.return_value.__enter__.return_value = mock_session
    return mock_session_local, mock_session


def test_allows_when_hit_count_is_within_max_hits() -> None:
    mock_session_local, mock_session = _mock_session_local_returning(5)
    with patch("app.services.auth.rate_limit.SessionLocal", mock_session_local):
        allowed = check_and_increment("login:ip:1.2.3.4", window_seconds=60, max_hits=10)
    assert allowed is True
    mock_session.commit.assert_called_once()


def test_rejects_once_hit_count_exceeds_max_hits() -> None:
    mock_session_local, mock_session = _mock_session_local_returning(11)
    with patch("app.services.auth.rate_limit.SessionLocal", mock_session_local):
        allowed = check_and_increment("login:ip:1.2.3.4", window_seconds=60, max_hits=10)
    assert allowed is False
    mock_session.commit.assert_called_once()


def test_allows_at_exactly_the_threshold() -> None:
    mock_session_local, _ = _mock_session_local_returning(10)
    with patch("app.services.auth.rate_limit.SessionLocal", mock_session_local):
        allowed = check_and_increment("login:ip:1.2.3.4", window_seconds=60, max_hits=10)
    assert allowed is True
