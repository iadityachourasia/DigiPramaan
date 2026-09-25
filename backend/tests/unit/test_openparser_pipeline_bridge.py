"""OP-Phase 5 — pure/mockable pieces of pipeline_bridge.py: the
query-first idempotency of `_get_or_create_job_intent`, and
`_drive_to_terminal`'s timeout behavior. No DB, no network — a mocked
session and a fake clock/sleeper."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.core.config import Settings
from app.services.ocr.openparser.pipeline_bridge import (
    OpenParserPipelineTimeout,
    _canonical_request_sha256,
    _drive_to_terminal,
    _get_or_create_escalation_job_intent,
    _get_or_create_job_intent,
    _media_type_for,
)


def _settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+psycopg://u:p@localhost/db",
        "s3_endpoint_url": "https://example.invalid",
        "s3_access_key": "x",
        "s3_secret_key": "x",
        "s3_bucket": "x",
        "supabase_anon_key": "x",
        "supabase_jwt_secret": "x" * 32,
        "openparser_api_key": "eig_live_fake",
        "openparser_idempotency_secret": "idem-secret",
        "openparser_job_max_age_seconds": 2,
        "openparser_poll_min_seconds": 0.01,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


# --- _media_type_for -------------------------------------------------------


@pytest.mark.parametrize(
    "storage_key,expected",
    [
        ("evidence/x/front-abc.jpg", "image/jpeg"),
        ("evidence/x/front-abc.jpeg", "image/jpeg"),
        ("evidence/x/front-abc.png", "image/png"),
        ("evidence/x/front-abc.webp", "image/webp"),
        ("evidence/x/front-abc", "application/octet-stream"),
        ("evidence/x/front-abc.bmp", "application/octet-stream"),
    ],
)
def test_media_type_for_extension(storage_key: str, expected: str) -> None:
    assert _media_type_for(storage_key) == expected


# --- _canonical_request_sha256 ---------------------------------------------


def test_canonical_request_sha256_is_deterministic() -> None:
    settings = _settings()
    assert _canonical_request_sha256(settings) == _canonical_request_sha256(settings)


def test_canonical_request_sha256_changes_with_model_or_profile() -> None:
    baseline = _canonical_request_sha256(_settings())
    different_model = _canonical_request_sha256(_settings(openparser_ocr_model="paddleocr-vl-2.0"))
    different_profile = _canonical_request_sha256(_settings(openparser_quality_profile="v2"))
    assert baseline != different_model
    assert baseline != different_profile


# --- _get_or_create_job_intent: query-first idempotency ---------------------


def _fake_evidence_image(**overrides) -> SimpleNamespace:
    base = dict(
        id=uuid.uuid4(),
        angle="front",
        storage_key="evidence/scan1/front-abc.jpg",
        content_hash="a" * 64,
        quality_result={"width": 1600, "height": 1200},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _fake_session() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4())


def test_returns_the_existing_row_without_creating_a_new_one() -> None:
    settings = _settings()
    db = MagicMock()
    existing_job = SimpleNamespace(id=uuid.uuid4())
    db.query.return_value.filter.return_value.first.return_value = existing_job

    s3_client = MagicMock()
    result = _get_or_create_job_intent(db, settings, _fake_session(), _fake_evidence_image(), s3_client)

    assert result is existing_job
    s3_client.head_object.assert_not_called()
    db.commit.assert_not_called()


def test_creates_a_new_intent_when_none_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    s3_client = MagicMock()
    s3_client.head_object.return_value = {"ContentLength": 12345}

    created = SimpleNamespace(id=uuid.uuid4())
    create_mock = MagicMock(return_value=created)
    monkeypatch.setattr("app.services.ocr.openparser.pipeline_bridge.create_job_intent", create_mock)

    result = _get_or_create_job_intent(db, settings, _fake_session(), _fake_evidence_image(), s3_client)

    assert result is created
    create_mock.assert_called_once()
    kwargs = create_mock.call_args.kwargs
    assert kwargs["input_byte_count"] == 12345
    assert kwargs["input_media_type"] == "image/jpeg"
    assert kwargs["provider"] == "openparser"
    assert kwargs["operation"] == "parse_single"
    assert kwargs["attempt_number"] == 1
    db.commit.assert_called_once()


# --- _get_or_create_escalation_job_intent: attempt lineage -------------------


def test_escalation_returns_the_existing_row_without_creating_a_new_one() -> None:
    settings = _settings()
    db = MagicMock()
    existing_job = SimpleNamespace(id=uuid.uuid4())
    db.query.return_value.filter.return_value.first.return_value = existing_job

    parent_job = SimpleNamespace(id=uuid.uuid4(), attempt_number=1)
    s3_client = MagicMock()
    result = _get_or_create_escalation_job_intent(
        db, settings, _fake_session(), _fake_evidence_image(), s3_client,
        model_id="azure-di-read", retry_reason="post_structuring_field_miss", parent_job=parent_job,
    )

    assert result is existing_job
    s3_client.head_object.assert_not_called()
    db.commit.assert_not_called()


def test_escalation_creates_attempt_two_with_lineage_and_the_escalation_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    s3_client = MagicMock()
    s3_client.head_object.return_value = {"ContentLength": 12345}

    created = SimpleNamespace(id=uuid.uuid4())
    create_mock = MagicMock(return_value=created)
    monkeypatch.setattr("app.services.ocr.openparser.pipeline_bridge.create_job_intent", create_mock)

    parent_job = SimpleNamespace(id=uuid.uuid4(), attempt_number=1)
    result = _get_or_create_escalation_job_intent(
        db, settings, _fake_session(), _fake_evidence_image(), s3_client,
        model_id="azure-di-read", retry_reason="post_structuring_field_miss", parent_job=parent_job,
    )

    assert result is created
    kwargs = create_mock.call_args.kwargs
    assert kwargs["attempt_number"] == 2  # parent's attempt_number (1) + 1, never a hardcoded 2
    assert kwargs["retry_reason"] == "post_structuring_field_miss"
    assert kwargs["parent_attempt_id"] == parent_job.id
    assert kwargs["model_id"] == "azure-di-read"  # NOT settings.openparser_ocr_model
    db.commit.assert_called_once()


def test_escalation_attempt_number_chains_off_the_parents_own_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A tier-2 escalation building on a tier-1 escalation's own miss must
    land at attempt_number=3, not collide with a hardcoded 2 — this is
    exactly what uq_ocr_provider_jobs_attempt's unique index requires."""
    settings = _settings()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    s3_client = MagicMock()
    s3_client.head_object.return_value = {"ContentLength": 12345}

    created = SimpleNamespace(id=uuid.uuid4())
    create_mock = MagicMock(return_value=created)
    monkeypatch.setattr("app.services.ocr.openparser.pipeline_bridge.create_job_intent", create_mock)

    tier1_job = SimpleNamespace(id=uuid.uuid4(), attempt_number=2)
    _get_or_create_escalation_job_intent(
        db, settings, _fake_session(), _fake_evidence_image(), s3_client,
        model_id="mistral-ocr-4", retry_reason="post_structuring_field_miss_tier2", parent_job=tier1_job,
    )

    assert create_mock.call_args.kwargs["attempt_number"] == 3


# --- _drive_to_terminal: timeout ---------------------------------------------


def test_drive_to_terminal_raises_after_the_age_budget_is_exceeded(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings(openparser_job_max_age_seconds=1)
    db = MagicMock()
    still_in_flight = SimpleNamespace(local_state="submitted")
    db.query.return_value.filter.return_value.all.return_value = [still_in_flight]

    monkeypatch.setattr("app.services.ocr.openparser.pipeline_bridge.run_submission_cycle", MagicMock())
    monkeypatch.setattr("app.services.ocr.openparser.pipeline_bridge.run_reconciliation_cycle", MagicMock())
    monkeypatch.setattr("app.services.ocr.openparser.pipeline_bridge.time.sleep", lambda _seconds: None)

    clock = iter([0.0, 0.0, 2.0])  # deadline computed from the first value, then jumps past it
    monkeypatch.setattr(
        "app.services.ocr.openparser.pipeline_bridge.time.monotonic", lambda: next(clock, 999.0)
    )

    pool = MagicMock()
    with pytest.raises(OpenParserPipelineTimeout):
        _drive_to_terminal(db, pool, settings, uuid.uuid4())
