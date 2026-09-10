"""
seed/demo_profiles.py — backfill `profiles` rows for Supabase Auth users
that already exist.

Deliberately does NOT create Supabase Auth users or touch any password —
this project has no service-role key, and even if it did, generating
accounts is a one-time manual step best done once, by a human, in the
Supabase dashboard (see the setup guidance already given for this project).
What this script does need only a plain DB connection: for each entry in
demo_profiles.json, look up the matching `auth.users` row BY EMAIL (an
account you already created), then upsert a `profiles` row for it with the
given role/department/jurisdiction.

Usage:
    1. Create your demo accounts in Supabase (Authentication -> Users -> Add
       user) if you haven't already — one per role you want to demo.
    2. Copy demo_profiles.example.json to demo_profiles.json (gitignored)
       and fill in the real emails/usernames/roles for the accounts you made.
    3. Run:  python -m app.seed.demo_profiles
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy import text

from app.db.session import SessionLocal

CONFIG_PATH = Path(__file__).parent / "demo_profiles.json"

REQUIRED_FIELDS = {
    "email",
    "username",
    "full_name",
    "role",
    "department",
    "region",
    "jurisdiction_level",
    "jurisdiction_name",
}

VALID_ROLES = {"Enforcement Officer", "Admin", "Reviewer"}


def _load_entries() -> list[dict]:
    if not CONFIG_PATH.exists():
        print(
            f"No {CONFIG_PATH.name} found. Copy demo_profiles.example.json to "
            f"{CONFIG_PATH.name} and fill in your real demo accounts first.",
            file=sys.stderr,
        )
        sys.exit(1)

    entries = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for entry in entries:
        missing = REQUIRED_FIELDS - entry.keys()
        if missing:
            raise ValueError(f"Entry for {entry.get('email', '?')} is missing: {missing}")
        if entry["role"] not in VALID_ROLES:
            raise ValueError(f"Entry for {entry['email']} has an unknown role: {entry['role']!r}")
    return entries


def main() -> None:
    entries = _load_entries()

    with SessionLocal() as db:
        for entry in entries:
            auth_user = db.execute(
                text("SELECT id FROM auth.users WHERE email = :email"),
                {"email": entry["email"]},
            ).first()

            if auth_user is None:
                print(
                    f"SKIP {entry['email']}: no matching Supabase Auth user. "
                    "Create it in the Supabase dashboard first, then re-run this script."
                )
                continue

            user_id = auth_user[0]
            db.execute(
                text(
                    """
                    INSERT INTO profiles
                        (id, username, email, full_name, role, department,
                         region, jurisdiction_level, jurisdiction_name)
                    VALUES
                        (:id, :username, :email, :full_name, :role, :department,
                         :region, :jurisdiction_level, :jurisdiction_name)
                    ON CONFLICT (id) DO UPDATE SET
                        username = EXCLUDED.username,
                        email = EXCLUDED.email,
                        full_name = EXCLUDED.full_name,
                        role = EXCLUDED.role,
                        department = EXCLUDED.department,
                        region = EXCLUDED.region,
                        jurisdiction_level = EXCLUDED.jurisdiction_level,
                        jurisdiction_name = EXCLUDED.jurisdiction_name
                    """
                ),
                {"id": user_id, **entry},
            )
            print(f"OK   {entry['email']} -> profile as {entry['role']} ({entry['username']})")

        db.commit()


if __name__ == "__main__":
    main()
