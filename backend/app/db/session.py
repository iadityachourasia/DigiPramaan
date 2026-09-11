"""
session.py — the sync SQLAlchemy engine and session factory.

Sync, not async: the frozen stack decision pairs SQLAlchemy 2.x with
psycopg3 (not asyncpg). At SIH scale, sync sessions running in FastAPI's
threadpool are simpler to write, test, and debug than async
session-per-request management, and Phase 0 has no domain queries yet to
stress this choice.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={
        # A short, explicit connect timeout so an unreachable Postgres fails
        # fast and predictably (e.g. for /health/ready) rather than hanging
        # on whatever the platform's own TCP/DNS timeout happens to be.
        "connect_timeout": 3,
        # This project's Postgres is reached through Supabase's pgbouncer
        # pooler in transaction mode, where a "connection" from psycopg3's
        # point of view can be handed a different underlying server
        # connection between statements. psycopg3 defaults to server-side
        # prepared statements after a query has run a few times
        # (`prepare_threshold`), which then reproducibly fails with
        # psycopg.errors.DuplicatePreparedStatement once the pooler swaps
        # the physical connection out from under it — observed during
        # Phase 8 validation, and confirmed to silently roll back the
        # whole enclosing transaction, not just the one failing statement.
        # `prepare_threshold=None` disables server-side prepare entirely,
        # the standard fix for psycopg3 against a transaction-mode pooler.
        "prepare_threshold": None,
    },
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session, always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
