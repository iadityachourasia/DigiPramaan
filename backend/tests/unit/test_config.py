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


def test_gemini_api_keys_splits_and_trims(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("GEMINI_API_KEY", "key1, key2 ,key3")

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.gemini_api_keys == ["key1", "key2", "key3"]


def test_gemini_api_keys_empty_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.gemini_api_keys == []


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


# --- OpenParser OCR migration, OP-Phase 2 — production validation ---------


def _openparser_env(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> None:
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("APP_ENV", "production")
    for key, value in overrides.items():
        monkeypatch.setenv(key, value)


def test_openparser_defaults_pass_production_validation_at_local_paddle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ocr_provider defaults to local_paddle, which needs none of the
    OpenParser-specific fields — production must not fail startup just
    because this integration exists in config."""
    _openparser_env(monkeypatch)
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.ocr_provider == "local_paddle"


def test_openparser_base_url_must_be_https_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    _openparser_env(monkeypatch, OPENPARSER_BASE_URL="http://api.openparser.dev")
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_openparser_base_url_rejects_userinfo_query_or_fragment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _openparser_env(
        monkeypatch, OPENPARSER_BASE_URL="https://user:pass@api.openparser.dev/?x=1"
    )
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_openparser_mode_requires_key_and_aliases_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _openparser_env(monkeypatch, OCR_PROVIDER="openparser")
    with pytest.raises(ValidationError, match="OPENPARSER_API_KEY"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_openparser_mode_with_full_credentials_passes_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _openparser_env(
        monkeypatch,
        OCR_PROVIDER="openparser_shadow",
        OPENPARSER_API_KEY="sk-test",
        OPENPARSER_API_KEY_ALIAS="primary-a",
        OPENPARSER_TENANT_ALIAS="approved-tenant-a",
        OPENPARSER_IDEMPOTENCY_SECRET="idem-secret",
    )
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.openparser_api_key is not None
    assert settings.openparser_api_key.get_secret_value() == "sk-test"


def test_openparser_mode_requires_idempotency_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _openparser_env(
        monkeypatch,
        OCR_PROVIDER="openparser",
        OPENPARSER_API_KEY="sk-test",
        OPENPARSER_API_KEY_ALIAS="primary-a",
        OPENPARSER_TENANT_ALIAS="approved-tenant-a",
    )
    monkeypatch.delenv("OPENPARSER_IDEMPOTENCY_SECRET", raising=False)
    with pytest.raises(ValidationError, match="OPENPARSER_IDEMPOTENCY_SECRET"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_openparser_secret_never_appears_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    _openparser_env(
        monkeypatch,
        OCR_PROVIDER="openparser",
        OPENPARSER_API_KEY="sk-super-secret",
        OPENPARSER_API_KEY_ALIAS="primary-a",
        OPENPARSER_TENANT_ALIAS="approved-tenant-a",
        OPENPARSER_IDEMPOTENCY_SECRET="idem-secret",
    )
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert "sk-super-secret" not in repr(settings.openparser_api_key)
    assert "sk-super-secret" not in str(settings.openparser_api_key)


@pytest.mark.parametrize(
    "field,value",
    [
        ("OPENPARSER_CONNECT_TIMEOUT_SECONDS", "0"),
        ("OPENPARSER_READ_TIMEOUT_SECONDS", "-1"),
        ("OPENPARSER_MAX_RESPONSE_BYTES", "0"),
        ("OPENPARSER_SUBMISSION_MAX_ATTEMPTS", "0"),
    ],
)
def test_openparser_non_positive_timeout_or_budget_fields_rejected_in_production(
    monkeypatch: pytest.MonkeyPatch, field: str, value: str
) -> None:
    _openparser_env(monkeypatch, **{field: value})
    with pytest.raises(ValidationError, match="positive"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_openparser_poll_min_must_not_exceed_poll_max_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _openparser_env(
        monkeypatch, OPENPARSER_POLL_MIN_SECONDS="90", OPENPARSER_POLL_MAX_SECONDS="60"
    )
    with pytest.raises(ValidationError, match="POLL_MIN"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_openparser_validation_is_skipped_outside_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Development/test never enforce this — a developer running locally
    with ocr_provider=openparser and no key set must not be blocked from
    starting the app for unrelated work."""
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("OCR_PROVIDER", "openparser")
    monkeypatch.delenv("OPENPARSER_API_KEY", raising=False)

    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.ocr_provider == "openparser"
