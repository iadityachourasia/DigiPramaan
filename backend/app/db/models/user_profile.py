"""
profiles — the public-schema companion to Supabase Auth's `auth.users`.

Supabase Auth owns `auth.users` (email, password hash, etc.) in its own
schema; this table holds everything DigiPramaan actually needs about a
signed-in officer — role, department, jurisdiction — keyed by the same id.
`id` is a foreign key into a table this codebase never creates or migrates
itself; no password lives here, ever.

`email` IS deliberately mirrored from `auth.users.email` — the one field
this table denormalizes, not duplicates by accident. The login form accepts
a username, but Supabase's password-grant endpoint authenticates by email
only; this column is what lets the login endpoint resolve "username the
officer typed" to "email Supabase Auth needs" with a single local lookup,
the same denormalize-for-a-real-reason discipline already used elsewhere in
this codebase (e.g. ActivityEvent.region). Supabase's own `auth.users.email`
stays the sole source of truth for actual authentication.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# A minimal stand-in for Supabase Auth's `auth.users`, registered on the same
# MetaData purely so `profiles.id`'s foreign key has a real Table object to
# resolve against. This project's own migrations never emit DDL for it —
# `auth.users` already exists in any Supabase project, managed entirely by
# Supabase Auth.
auth_users = Table(
    "users",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    schema="auth",
)


class Profile(Base):
    __tablename__ = "profiles"

    # No server_default here — this id is assigned at insert time to match
    # the Supabase Auth user it belongs to, never generated independently.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id"), primary_key=True
    )
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    jurisdiction_level: Mapped[str | None] = mapped_column(String, nullable=True)
    jurisdiction_name: Mapped[str | None] = mapped_column(String, nullable=True)
