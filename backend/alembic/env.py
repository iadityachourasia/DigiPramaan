"""
alembic/env.py — wired to app.core.config (not a hardcoded URL) and to
app.db.base.Base.metadata, populated by importing app.db.models below.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base

# Registers every table on Base.metadata so --autogenerate (and this
# project's own hand-authored migrations) can see the full MVP schema.
import app.db.models  # noqa: E402,F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)


def _include_object(object, name, type_, reflected, compare_to) -> bool:
    """`auth.users` (app/db/models/user_profile.py) is Supabase Auth's own
    table — `profiles.id` has an FK into it, so it must exist on
    Base.metadata for that FK to resolve, but this project's migrations
    never create or alter it (see 0001_mvp_schema.py's own docstring and
    docker/postgres-init/002-auth-stub.sql, which stubs it locally). Without
    this filter, `alembic check`/`--autogenerate` always reports it as a
    spurious "new table" — a false positive on every run, not a real drift
    signal. R1.3, 2026-09-19."""
    if type_ == "table" and getattr(object, "schema", None) == "auth":
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
