"""
base.py — the SQLAlchemy declarative base.

Deliberately empty in Phase 0: no domain model imports here yet. Phase 2
adds `app/db/models/*` modules that import `Base` and get picked up by
Alembic's `env.py` (which imports `Base.metadata`) automatically.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
