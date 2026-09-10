"""MVP schema — all 12 tables (11 domain tables + reports)

Revision ID: 0001_mvp_schema
Revises:
Create Date: 2026-09-10

WHY create_all/drop_all INSTEAD OF op.create_table(...) PER TABLE:

This migration was authored with no live database available to run
`alembic revision --autogenerate` against (no local Postgres, no Supabase
connection yet at authoring time) — `app.db.models` is the only source of
truth, already verified to compile cleanly against the Postgres dialect
(`CreateTable(table).compile(dialect=postgresql.dialect())` for all 12
tables, and the partial unique index on `violation_cases`, both checked
before this file was written). Rather than hand-transcribing each column
into `op.create_table(...)` calls — real risk of a copy-paste drift between
the model and the migration — `upgrade()`/`downgrade()` call
`Base.metadata.create_all()`/`drop_all()` directly against the exact same
Table objects, scoped to the tables this project owns. This guarantees the
migration can never disagree with the models it was generated from.

CONSTRAINT THIS IMPLIES, LEARNED THE HARD WAY: because this migration
always reflects whatever `app.db.models` CURRENTLY says — not a frozen
snapshot of the models as they were on 2026-09-10 — it is NOT safe to layer
an incremental `op.add_column(...)`-style migration on top of it for a
column that already exists on a model this file covers. `profiles.email`
was briefly its own migration (0002) before being folded back into this
one: 0001's `create_all()` had already started including it the moment the
`Profile` model gained the column, so 0002's `op.add_column` collided with
it on a truly fresh database. The fix was to squash 0002 back in here
rather than special-case it. The real rule going forward: the FIRST
schema-establishing migration in a project either freezes an explicit,
separate snapshot of the schema, or — as chosen here for speed — every
change to a table this migration already owns gets folded back into this
same file until a second, genuinely independent migration is needed for
something this file does NOT yet cover (a new table, not a new column on an
existing one).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.db.base import Base
import app.db.models  # noqa: F401 — populates Base.metadata

revision: str = "0001_mvp_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every table this migration owns, excluding the `auth.users` stub
# (app/db/models/user_profile.py) — that table is Supabase Auth's own and
# must never be created or dropped by this project's migrations.
_OWNED_TABLES = [
    table for table in Base.metadata.tables.values() if table.schema != "auth"
]


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, tables=_OWNED_TABLES)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=_OWNED_TABLES)
