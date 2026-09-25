"""
services/ocr/openparser/budget.py — the escalation circuit breaker.

A counter + threshold, not a subsystem: escalation cost is variable per
scan (unlike the primary pass's fixed single call), so this exists purely
to stop a bug that falsely triggers escalation on every scan from quietly
running up an unbounded vendor bill. DB-backed, not an in-process counter
— Azure App Service restarts and can run multiple workers, so an
in-memory counter would silently undercount. Mirrors `openparser/
client.py`'s own `_CircuitBreaker` in spirit: protect the system, never
block the primary path outright — when the budget is exhausted, the scan
simply proceeds without escalation (today's behavior), it never fails.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import OcrProviderJob

logger = structlog.get_logger(__name__)


def escalation_budget_ok(db: Session, settings: Settings) -> bool:
    """True when firing another escalation (an OcrProviderJob with
    attempt_number >= 2) would stay within the configured hourly/daily
    caps. Counts existing escalation rows created in the trailing
    hour/day — not a token bucket, not persisted state of its own, just a
    query against data this feature already writes."""
    now = datetime.now(timezone.utc)

    hourly = (
        db.query(func.count(OcrProviderJob.id))
        .filter(
            OcrProviderJob.attempt_number >= 2,
            OcrProviderJob.created_at >= now - timedelta(hours=1),
        )
        .scalar()
    )
    if hourly >= settings.openparser_fallback_max_escalations_per_hour:
        logger.warning("ocr_escalation_hourly_cap_reached", hourly=hourly)
        return False

    daily = (
        db.query(func.count(OcrProviderJob.id))
        .filter(
            OcrProviderJob.attempt_number >= 2,
            OcrProviderJob.created_at >= now - timedelta(days=1),
        )
        .scalar()
    )
    if daily >= settings.openparser_fallback_max_escalations_per_day:
        logger.warning("ocr_escalation_daily_cap_reached", daily=daily)
        return False

    return True
