"""Unit tests for openparser/budget.py's escalation circuit breaker — a
counter + threshold, not a subsystem. DB-backed (not in-process) since
Azure App Service restarts/multi-worker would undercount an in-memory
counter."""

from __future__ import annotations

from unittest.mock import MagicMock

from app.core.config import Settings
from app.services.ocr.openparser.budget import escalation_budget_ok


def _settings(**overrides) -> Settings:
    kwargs = dict(
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost/db",
        s3_endpoint_url="https://example.invalid",
        s3_access_key="x",
        s3_secret_key="x",
        s3_bucket="x",
        supabase_anon_key="x",
        supabase_jwt_secret="x" * 32,
        openparser_fallback_max_escalations_per_hour=50,
        openparser_fallback_max_escalations_per_day=300,
    )
    kwargs.update(overrides)
    return Settings(**kwargs)  # type: ignore[call-arg]


def _db_with_counts(hourly: int, daily: int) -> MagicMock:
    db = MagicMock()
    # First .scalar() call is the hourly count, second is the daily count.
    db.query.return_value.filter.return_value.scalar.side_effect = [hourly, daily]
    return db


def test_budget_ok_when_well_under_both_caps() -> None:
    db = _db_with_counts(hourly=2, daily=10)
    assert escalation_budget_ok(db, _settings()) is True


def test_budget_exhausted_when_hourly_cap_reached() -> None:
    db = _db_with_counts(hourly=50, daily=10)
    assert escalation_budget_ok(db, _settings()) is False


def test_budget_exhausted_when_daily_cap_reached() -> None:
    db = _db_with_counts(hourly=2, daily=300)
    assert escalation_budget_ok(db, _settings()) is False


def test_budget_respects_configured_thresholds() -> None:
    db = _db_with_counts(hourly=5, daily=10)
    settings = _settings(openparser_fallback_max_escalations_per_hour=5)
    assert escalation_budget_ok(db, settings) is False
