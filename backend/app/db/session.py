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
    # A short, explicit connect timeout so an unreachable Postgres fails
    # fast and predictably (e.g. for /health/ready) rather than hanging on
    # whatever the platform's own TCP/DNS timeout happens to be.
    connect_args={"connect_timeout": 3},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session, always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
