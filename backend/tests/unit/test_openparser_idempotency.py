"""OP-Phase 3 — idempotency-key derivation (spec §9). Pure function, no DB."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services.ocr.openparser.idempotency import derive_idempotency_key


def _settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+psycopg://u:p@localhost/db",
        "s3_endpoint_url": "https://example.invalid",
        "s3_access_key": "x",
        "s3_secret_key": "x",
        "s3_bucket": "x",
        "supabase_anon_key": "x",
        "supabase_jwt_secret": "x" * 32,
        "openparser_idempotency_secret": "test-secret-not-the-api-key",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _kwargs(**overrides) -> dict:
    base = dict(
        scan_id="11111111-1111-1111-1111-111111111111",
        image_id="22222222-2222-2222-2222-222222222222",
        input_sha256="a" * 64,
        model="paddleocr-vl-1.6",
        profile_version="openparser-quality-max-v1",
        canonical_request_sha256="b" * 64,
        attempt=1,
    )
    base.update(overrides)
    return base


def test_requires_the_idempotency_secret() -> None:
    settings = _settings(openparser_idempotency_secret=None)
    with pytest.raises(ValueError, match="OPENPARSER_IDEMPOTENCY_SECRET"):
        derive_idempotency_key(settings, **_kwargs())


def test_deterministic_for_identical_inputs() -> None:
    settings = _settings()
    first = derive_idempotency_key(settings, **_kwargs())
    second = derive_idempotency_key(settings, **_kwargs())
    assert first == second


@pytest.mark.parametrize(
    "changed_field,changed_value",
    [
        ("scan_id", "99999999-9999-9999-9999-999999999999"),
        ("image_id", "99999999-9999-9999-9999-999999999999"),
        ("input_sha256", "c" * 64),
        ("model", "paddleocr-vl-2.0"),
        ("profile_version", "openparser-quality-max-v2"),
        ("canonical_request_sha256", "d" * 64),
        ("attempt", 2),
    ],
)
def test_any_changed_input_yields_a_different_key(changed_field: str, changed_value) -> None:
    settings = _settings()
    baseline = derive_idempotency_key(settings, **_kwargs())
    changed = derive_idempotency_key(settings, **_kwargs(**{changed_field: changed_value}))
    assert baseline != changed


def test_a_different_secret_yields_a_different_key() -> None:
    baseline = derive_idempotency_key(_settings(), **_kwargs())
    other = derive_idempotency_key(
        _settings(openparser_idempotency_secret="a-completely-different-secret"), **_kwargs()
    )
    assert baseline != other


def test_key_format_has_a_stable_prefix_and_no_raw_material() -> None:
    settings = _settings()
    key = derive_idempotency_key(settings, **_kwargs())
    assert key.startswith("dp1-")
    # Never contains PII/filenames/OCR text — only the prefix + hex digest.
    assert "scan=" not in key
    assert "image=" not in key
    digest = key[len("dp1-") :]
    assert len(digest) == 64
    int(digest, 16)  # must be valid hex


def test_key_fits_the_contract_length_limit() -> None:
    """OCR_API_OPENAPI.yaml's IdempotencyKey parameter: maxLength 256."""
    key = derive_idempotency_key(_settings(), **_kwargs())
    assert len(key) <= 256
