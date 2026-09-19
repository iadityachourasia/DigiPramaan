"""
auth_rate_limit_hits — P2 hardening (2026-09-19, F-010): a fixed-window
counter table for login/refresh rate limiting, upserted via
`INSERT ... ON CONFLICT (bucket_key, window_start) DO UPDATE ...
RETURNING hit_count` (app/services/auth/rate_limit.py) — no Redis/
external cache, matching this project's Postgres-first discipline (the
same "one row is its own progress/counter source of truth" convention
`scan_sessions.stages`/`OcrProviderJob` already use).

`bucket_key` examples: "login:ip:203.0.113.5", "login:email:officer@
example.com", "refresh:ip:203.0.113.5" — see client_ip.py/rate_limit.py
for how these are built. `window_start` is the fixed window's start,
truncated to the configured window size; a new window is a new row, not
a reset of an existing one, so no separate "last reset" bookkeeping is
needed.

No scheduled cleanup job exists in this project (no cron/scheduler
anywhere) — old rows are pruned opportunistically inside
`check_and_increment` itself (a small, probabilistically-triggered
`DELETE ... LIMIT`), documented there, rather than adding this project's
first external scheduler dependency for what is otherwise an unbounded-
growth housekeeping task.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class AuthRateLimitHit(Base):
    __tablename__ = "auth_rate_limit_hits"
    __table_args__ = (
        Index(
            "uq_auth_rate_limit_hits_bucket_window", "bucket_key", "window_start", unique=True
        ),
        Index("ix_auth_rate_limit_hits_window_start", "window_start"),
        CheckConstraint("hit_count >= 0", name="ck_auth_rate_limit_hits_hit_count_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    bucket_key: Mapped[str] = mapped_column(String, nullable=False)
    window_start: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
