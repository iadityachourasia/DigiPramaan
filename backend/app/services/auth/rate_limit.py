"""
services/auth/rate_limit.py — P2 hardening (2026-09-19, F-010): a
Postgres-backed fixed-window rate limiter for /auth/login and
/auth/refresh. See app/db/models/auth_rate_limit_hit.py's own docstring
for the table design.

`check_and_increment` runs and commits in its OWN short transaction, via
a dedicated `SessionLocal()` rather than the request-scoped `db`
dependency — a rate-limit hit must durably count even if the surrounding
request later raises for an unrelated reason (a retried request in the
same window must still see the earlier attempt counted), and keeping it
off the request's own session avoids entangling this with whatever that
session's own commit/rollback lifecycle does.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.session import SessionLocal

# Opportunistic cleanup runs on roughly 1-in-200 calls — no scheduler
# exists in this project (see the model's own docstring), so this bounds
# the table's growth without adding one.
_CLEANUP_PROBABILITY = 1 / 200
_CLEANUP_BATCH_LIMIT = 500
_CLEANUP_RETENTION = timedelta(hours=1)


def _window_start(now: datetime, window_seconds: int) -> datetime:
    epoch_seconds = int(now.timestamp())
    truncated = epoch_seconds - (epoch_seconds % window_seconds)
    return datetime.fromtimestamp(truncated, tz=timezone.utc)


def _maybe_cleanup(db) -> None:
    if random.random() > _CLEANUP_PROBABILITY:
        return
    cutoff = datetime.now(timezone.utc) - _CLEANUP_RETENTION
    db.execute(
        text(
            """
            DELETE FROM auth_rate_limit_hits
            WHERE id IN (
                SELECT id FROM auth_rate_limit_hits
                WHERE window_start < :cutoff
                LIMIT :limit
            )
            """
        ),
        {"cutoff": cutoff, "limit": _CLEANUP_BATCH_LIMIT},
    )


def check_and_increment(bucket_key: str, *, window_seconds: int, max_hits: int) -> bool:
    """Returns True when the request is allowed (hit_count is now within
    max_hits), False when it should be rejected with a 429."""
    now = datetime.now(timezone.utc)
    window = _window_start(now, window_seconds)

    with SessionLocal() as db:
        result = db.execute(
            text(
                """
                INSERT INTO auth_rate_limit_hits (bucket_key, window_start, hit_count, updated_at)
                VALUES (:bucket_key, :window_start, 1, now())
                ON CONFLICT (bucket_key, window_start)
                DO UPDATE SET hit_count = auth_rate_limit_hits.hit_count + 1, updated_at = now()
                RETURNING hit_count
                """
            ),
            {"bucket_key": bucket_key, "window_start": window},
        )
        hit_count = result.scalar_one()
        _maybe_cleanup(db)
        db.commit()

    return hit_count <= max_hits
