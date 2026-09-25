"""
Unit tests for app/jobs/pipeline.py's post-structuring OCR escalation
(`_escalate_missing_fields`/`_try_ocr_escalation_tier`) — the fix for the
reported bug where a genuinely-present declaration silently dropped by
the primary OCR pass turned into a false compliance FAIL, because the
only prior fallback (FALLBACK_MIN_BLOCKS) only ever fires on a near-total
scan-wide read failure, never on a single missed required field.

Mocks every OpenParser/Gemini call site (`run_openparser_escalation_
extraction`, `structure_with_coverage_retry`, `escalation_budget_ok`,
`OpenParserKeyPool`, `get_s3_client`, `emit`) so these run in milliseconds
with no live infra — same style as test_gemini_coverage_retry.py, which
tests `structure_with_coverage_retry` directly rather than through the
full pipeline stage machine.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.jobs.pipeline import REQUIRED_FIELD_IDS, _escalate_missing_fields
from app.services.extraction.schema import ExtractedField, StructuredExtraction
from app.services.ocr.provider import OcrBlock

SCAN_ID = uuid.uuid4()


def _settings(**overrides) -> Settings:
    kwargs = dict(
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost/db",
        s3_endpoint_url="https://example.invalid",
        s3_access_key="x",
        s3_secret_key="x",
        s3_bucket="x",
        supabase_anon_key="x",
        supabase_jwt_secret="x" * 32,
        ocr_provider="openparser",
        openparser_fallback_enabled=True,
    )
    kwargs.update(overrides)
    return Settings(**kwargs)  # type: ignore[call-arg]


def _field(value: str | None, not_detected: bool) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=[], extraction_confidence=0.0)


def _extraction(**overrides) -> StructuredExtraction:
    base = {field_id: _field(f"{field_id}-value", False) for field_id in REQUIRED_FIELD_IDS}
    base.update(overrides)
    return StructuredExtraction(**base)


def _fake_evidence_image(angle: str):
    class _Image:
        pass

    img = _Image()
    img.id = uuid.uuid4()
    img.angle = angle
    img.storage_key = f"evidence/{SCAN_ID}/{angle}-abc.png"
    img.quality_result = {"overall_verdict": "PASS", "reason": None}
    return img


def _fake_session():
    class _Session:
        pass

    s = _Session()
    s.id = SCAN_ID
    return s


IMAGES = [_fake_evidence_image("front"), _fake_evidence_image("back")]


def test_no_escalation_when_nothing_missing() -> None:
    db = MagicMock()
    settings = _settings()
    extraction = _extraction()  # every required field already found

    with patch("app.jobs.pipeline.run_openparser_escalation_extraction") as mock_escalate:
        result_extraction, result_blocks = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, extraction,
        )

    mock_escalate.assert_not_called()
    assert result_extraction is extraction
    assert result_blocks == []


def test_escalation_skipped_when_disabled() -> None:
    """Default production behavior: openparser_fallback_enabled=False must
    be a complete no-op, even with a missing required field."""
    db = MagicMock()
    settings = _settings(openparser_fallback_enabled=False)
    extraction = _extraction(mrp=_field(None, True))

    with patch("app.jobs.pipeline.run_openparser_escalation_extraction") as mock_escalate:
        result_extraction, _ = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, extraction,
        )

    mock_escalate.assert_not_called()
    assert result_extraction is extraction


def test_escalation_skipped_for_non_openparser_provider() -> None:
    """Escalation attaches a later attempt_number to an existing primary
    OcrProviderJob row — those rows only exist under ocr_provider=
    'openparser', so local_paddle/openparser_shadow must no-op here too."""
    db = MagicMock()
    settings = _settings(ocr_provider="local_paddle")
    extraction = _extraction(mrp=_field(None, True))

    with patch("app.jobs.pipeline.run_openparser_escalation_extraction") as mock_escalate:
        result_extraction, _ = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, extraction,
        )

    mock_escalate.assert_not_called()
    assert result_extraction is extraction


def test_escalation_skipped_when_budget_exhausted() -> None:
    db = MagicMock()
    settings = _settings()
    extraction = _extraction(mrp=_field(None, True))

    with patch("app.jobs.pipeline.run_openparser_escalation_extraction") as mock_escalate, \
         patch("app.jobs.pipeline.escalation_budget_ok", return_value=False):
        result_extraction, _ = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, extraction,
        )

    mock_escalate.assert_not_called()
    assert result_extraction is extraction


def test_escalation_recovers_silently_dropped_required_field() -> None:
    """The direct regression test for the reported bug: MRP is genuinely
    on the package but the primary OCR pass silently dropped its line —
    every other required field structured cleanly, so today's scan-wide
    FALLBACK_MIN_BLOCKS check would never have fired. Escalation recovers
    it via a second provider + structure_with_coverage_retry, and an
    'ocr_retried' audit event is recorded."""
    db = MagicMock()
    settings = _settings()
    primary_extraction = _extraction(mrp=_field(None, True))  # only MRP missing
    recovered_extraction = _extraction(mrp=_field("Rs 199, incl. of all taxes", False))

    escalation_block = OcrBlock(
        image_id=str(IMAGES[0].id), text="MRP Rs 199 incl. of all taxes",
        confidence=91.0, bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="mistral-ocr-4",
    )

    with patch("app.jobs.pipeline.escalation_budget_ok", return_value=True), \
         patch("app.jobs.pipeline.OpenParserKeyPool"), \
         patch("app.jobs.pipeline.get_s3_client"), \
         patch(
             "app.jobs.pipeline.run_openparser_escalation_extraction",
             return_value=([escalation_block], {}),
         ) as mock_escalate, \
         patch(
             "app.jobs.pipeline.structure_with_coverage_retry", return_value=recovered_extraction,
         ) as mock_retry, \
         patch("app.jobs.pipeline.emit") as mock_emit:
        result_extraction, result_blocks = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, primary_extraction,
        )

    mock_escalate.assert_called_once()
    call_kwargs = mock_escalate.call_args.kwargs
    assert call_kwargs["model_id"] == "mistral-ocr-4"
    assert call_kwargs["target_image_ids"] == {str(IMAGES[0].id)}  # mrp -> "front"
    assert call_kwargs["retry_reason"] == "post_structuring_field_miss"

    mock_retry.assert_called_once()
    assert mock_retry.call_args.kwargs["required_field_ids"] == ["mrp"]

    assert result_extraction.mrp.not_detected is False
    assert result_extraction.mrp.value == "Rs 199, incl. of all taxes"
    assert result_blocks == [escalation_block]

    mock_emit.assert_called_once()
    assert mock_emit.call_args.args[1] == "ocr_retried"
    assert mock_emit.call_args.kwargs["detail"]["missingFields"] == ["mrp"]
    assert mock_emit.call_args.kwargs["detail"]["escalationModel"] == "mistral-ocr-4"
    db.commit.assert_called()


def test_escalation_tiers_fire_in_mistral_google_azure_order() -> None:
    """Escalation order is a fixed product decision: Mistral OCR 4, then
    Google Enterprise Document OCR, then Azure DI Read as the last resort
    — each tier only attempting the fields the previous tier(s) still
    left not_detected."""
    db = MagicMock()
    settings = _settings()
    primary_extraction = _extraction(mrp=_field(None, True), address=_field(None, True))
    tier1_extraction = _extraction(mrp=_field("Rs 199", False), address=_field(None, True))  # recovered mrp, not address
    tier2_extraction = _extraction(mrp=_field("Rs 199", False), address=_field("123 Main St", False))

    tier1_block = OcrBlock(
        image_id=str(IMAGES[0].id), text="Rs 199", confidence=88.0,
        bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="mistral-ocr-4",
    )
    tier2_block = OcrBlock(
        image_id=str(IMAGES[1].id), text="123 Main St", confidence=85.0,
        bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="google-docai-ocr",
    )

    with patch("app.jobs.pipeline.escalation_budget_ok", return_value=True), \
         patch("app.jobs.pipeline.OpenParserKeyPool"), \
         patch("app.jobs.pipeline.get_s3_client"), \
         patch(
             "app.jobs.pipeline.run_openparser_escalation_extraction",
             side_effect=[([tier1_block], {}), ([tier2_block], {})],
         ) as mock_escalate, \
         patch(
             "app.jobs.pipeline.structure_with_coverage_retry",
             side_effect=[tier1_extraction, tier2_extraction],
         ), \
         patch("app.jobs.pipeline.emit"):
        result_extraction, result_blocks = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, primary_extraction,
        )

    # Only 2 calls — tier2 (google) already recovered everything, so tier3
    # (azure) is never attempted despite being configured by default.
    assert mock_escalate.call_count == 2
    tier1_kwargs, tier2_kwargs = (c.kwargs for c in mock_escalate.call_args_list)
    assert tier1_kwargs["model_id"] == "mistral-ocr-4"
    assert tier1_kwargs["retry_reason"] == "post_structuring_field_miss"
    assert tier2_kwargs["model_id"] == "google-docai-ocr"
    assert tier2_kwargs["retry_reason"] == "post_structuring_field_miss_tier2"

    assert result_extraction.mrp.not_detected is False
    assert result_extraction.address.not_detected is False
    assert result_blocks == [tier1_block, tier2_block]


def test_escalation_falls_through_to_tier3_azure_as_last_resort() -> None:
    db = MagicMock()
    settings = _settings()
    primary_extraction = _extraction(address=_field(None, True))
    still_missing_extraction = _extraction(address=_field(None, True))  # tiers 1 & 2 also fail
    recovered_extraction = _extraction(address=_field("123 Main St", False))

    tier1_block = OcrBlock(
        image_id=str(IMAGES[1].id), text="unrelated", confidence=40.0,
        bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="mistral-ocr-4",
    )
    tier2_block = OcrBlock(
        image_id=str(IMAGES[1].id), text="also unrelated", confidence=45.0,
        bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="google-docai-ocr",
    )
    tier3_block = OcrBlock(
        image_id=str(IMAGES[1].id), text="123 Main St", confidence=90.0,
        bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="azure-di-read",
    )

    with patch("app.jobs.pipeline.escalation_budget_ok", return_value=True), \
         patch("app.jobs.pipeline.OpenParserKeyPool"), \
         patch("app.jobs.pipeline.get_s3_client"), \
         patch(
             "app.jobs.pipeline.run_openparser_escalation_extraction",
             side_effect=[([tier1_block], {}), ([tier2_block], {}), ([tier3_block], {})],
         ) as mock_escalate, \
         patch(
             "app.jobs.pipeline.structure_with_coverage_retry",
             side_effect=[still_missing_extraction, still_missing_extraction, recovered_extraction],
         ), \
         patch("app.jobs.pipeline.emit"):
        result_extraction, _ = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, primary_extraction,
        )

    assert mock_escalate.call_count == 3
    model_ids = [c.kwargs["model_id"] for c in mock_escalate.call_args_list]
    assert model_ids == ["mistral-ocr-4", "google-docai-ocr", "azure-di-read"]
    assert result_extraction.address.not_detected is False


def test_later_tiers_skipped_when_not_configured() -> None:
    db = MagicMock()
    settings = _settings(openparser_fallback_tier2_ocr_model=None, openparser_fallback_tier3_ocr_model=None)
    primary_extraction = _extraction(address=_field(None, True))
    tier1_extraction = _extraction(address=_field(None, True))  # tier 1 also fails to find it

    tier1_block = OcrBlock(
        image_id=str(IMAGES[1].id), text="unrelated text", confidence=60.0,
        bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model="mistral-ocr-4",
    )

    with patch("app.jobs.pipeline.escalation_budget_ok", return_value=True), \
         patch("app.jobs.pipeline.OpenParserKeyPool"), \
         patch("app.jobs.pipeline.get_s3_client"), \
         patch(
             "app.jobs.pipeline.run_openparser_escalation_extraction",
             return_value=([tier1_block], {}),
         ) as mock_escalate, \
         patch("app.jobs.pipeline.structure_with_coverage_retry", return_value=tier1_extraction), \
         patch("app.jobs.pipeline.emit"):
        result_extraction, _ = _escalate_missing_fields(
            db, settings, _fake_session(), IMAGES, [], {}, primary_extraction,
        )

    mock_escalate.assert_called_once()  # tier 1 only — tiers 2 & 3 never attempted
    assert result_extraction.address.not_detected is True
