"""
Settings must load real values from the environment, and a missing required
variable must fail loudly at construction time — never silently fall back to
a guessed default. `_env_file=None` isolates each case from the repo's own
checked-out backend/.env so this test means the same thing on every machine.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

REQUIRED_ENV = {
    "DATABASE_URL": "postgresql+psycopg://postgres.abcdefgh:pw@aws-0-x.pooler.supabase.com:6543/postgres",
    "S3_ENDPOINT_URL": "http://localhost:9000",
    "S3_ACCESS_KEY": "key",
    "S3_SECRET_KEY": "secret",
    "S3_BUCKET": "bucket",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_JWT_SECRET": "test-jwt-secret",
}


def test_settings_load_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.database_url == REQUIRED_ENV["DATABASE_URL"]
    assert settings.s3_bucket == REQUIRED_ENV["S3_BUCKET"]
    # Optional fields fall back to their documented defaults.
    assert settings.app_port == 8000
    assert settings.s3_region == "us-east-1"
    assert settings.s3_auto_create_bucket is True


def test_settings_missing_required_var_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_cors_origin_list_splits_and_trims(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("CORS_ORIGINS", "http://a.test, http://b.test")

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.cors_origin_list == ["http://a.test", "http://b.test"]


def test_resolved_supabase_url_derives_from_database_url_project_ref(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.resolved_supabase_url == "https://abcdefgh.supabase.co"


def test_explicit_supabase_url_overrides_derivation(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("SUPABASE_URL", "https://explicit-project.supabase.co/")

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    # Trailing slash stripped too, since callers append their own paths.
    assert settings.resolved_supabase_url == "https://explicit-project.supabase.co"
