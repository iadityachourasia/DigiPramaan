-- Runs once, only on first container init (empty data volume), after
-- 001-create-test-db.sql.
--
-- A minimal stand-in for Supabase Auth's `auth.users`, for LOCAL/TEST
-- databases only. `profiles.id` has a foreign key into `auth.users(id)`
-- (see app/db/models/user_profile.py) — on Supabase that table is managed
-- by Supabase Auth itself and this project's migrations never create it,
-- so a plain Postgres needs this stub before `alembic upgrade head` can
-- create `profiles` at all. Never run this against Supabase.
--
-- Created in both the dev database and the separate test database, since
-- migration and authorization tests run against `digipramaan_test`.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text
);

\connect digipramaan_test

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text
);
