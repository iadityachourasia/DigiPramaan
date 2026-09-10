"""
Requires a live Postgres — the docker-compose 'postgres' service. Excluded
from the default `pytest` run (see pyproject.toml's `addopts`); run
explicitly with `pytest -m integration`.

When run explicitly, this must FAIL — not skip — if the database is
unreachable. A skip would silently hide a real regression (e.g. a broken
connection string) from anyone who ran this suite believing infrastructure
was up.
"""

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal

pytestmark = pytest.mark.integration


def test_select_1_against_database() -> None:
    with SessionLocal() as db:
        result = db.execute(text("SELECT 1")).scalar_one()
    assert result == 1
