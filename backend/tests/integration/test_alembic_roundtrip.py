"""
Proves the Alembic <-> SQLAlchemy <-> Postgres wiring works end to end
against a real database: `upgrade head` creates the `alembic_version`
tracking table AND the full MVP schema (0001_mvp_schema); `downgrade base`
removes the MVP schema tables and clears the tracked revision.

`alembic_version` itself is NOT expected to be dropped by `downgrade base`
— confirmed against a real database, not assumed: Alembic's own behavior is
to delete the now-stale revision row(s) and leave its bookkeeping table
behind empty, not to drop the table. Asserting its removal here would be
testing a belief about Alembic, not this project's own migration.

Runs against TEST_DATABASE_URL when set. When it is NOT set — this project
currently has only one Supabase project, so no genuinely separate test
database exists yet — this test does NOT silently fall back to the shared
dev database anymore (Phase 3.1 fix; it used to, and `pytest -m
integration` run during normal development destroyed real demo data in
that shared project more than once). Instead it SKIPS unless
ALLOW_DESTRUCTIVE_DB_TESTS=1 is explicitly set, an unambiguous
"I am choosing to point this at DATABASE_URL and accept it will be wiped"
acknowledgment — never something a routine `pytest -m integration` run
does by accident. The migration assertions themselves are UNCHANGED; only
which database this is allowed to run against, and under what
circumstances, is new.

Because of that DATABASE_URL fallback path when explicitly opted in, this
test restores the schema to `head` in a `finally` block no matter what
happens, so it can never leave the shared database torn down for whatever
runs after it — a real ordering bug this suite hit once already (a
downgrade-without-restore here left `profiles` missing for
test_auth_live.py, which alphabetically runs right after this file).
Excluded from the default `pytest` run; run explicitly with
`pytest -m integration`. Must FAIL, not skip, once it has actually started
running (dedicated test DB configured, or explicit opt-in) and Postgres is
unreachable — the skip path above is gated purely on configuration, never
on connectivity.
"""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings

pytestmark = pytest.mark.integration

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _alembic_config(database_url: str) -> Config:
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


def test_upgrade_head_then_downgrade_base_round_trip() -> None:
    settings = get_settings()
    if not settings.test_database_url and os.environ.get("ALLOW_DESTRUCTIVE_DB_TESTS") != "1":
        pytest.skip(
            "This test drops and recreates the entire schema. No dedicated "
            "TEST_DATABASE_URL is configured, so it would otherwise run against the "
            "shared DATABASE_URL (dev/demo Supabase project) and destroy any real data "
            "there. Set TEST_DATABASE_URL to a real separate database, or set "
            "ALLOW_DESTRUCTIVE_DB_TESTS=1 to explicitly acknowledge running this "
            "against the shared dev database anyway."
        )
    database_url = settings.test_database_url or settings.database_url
    cfg = _alembic_config(database_url)
    engine = create_engine(database_url)

    command.upgrade(cfg, "head")
    inspector = inspect(engine)
    assert inspector.has_table("alembic_version"), (
        "alembic upgrade head should create the alembic_version tracking table"
    )
    for table_name in ("profiles", "compliance_records", "violation_cases", "reports"):
        assert inspector.has_table(table_name), f"{table_name} should exist after upgrade head"

    try:
        command.downgrade(cfg, "base")
        inspector = inspect(engine)
        assert not inspector.has_table("compliance_records"), (
            "alembic downgrade base should remove the MVP schema tables"
        )
        assert not inspector.has_table("scan_sessions"), (
            "alembic downgrade base should remove the circularly-referenced "
            "scan_sessions table too, not just compliance_records"
        )
        if inspector.has_table("alembic_version"):
            with engine.connect() as conn:
                remaining = conn.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar()
            assert remaining == 0, (
                "alembic_version should have no tracked revision after downgrade base"
            )
    finally:
        # Always restore to head, pass or fail — see the module docstring on
        # why this matters more than usual (no isolated test database yet).
        command.upgrade(cfg, "head")
        assert inspect(engine).has_table("profiles"), (
            "restoring to head after the round trip must leave the schema fully back in place"
        )
