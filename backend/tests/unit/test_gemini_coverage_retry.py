"""OP-Phase 6 — `structure_with_coverage_retry`, built and tested but
NOT called from `jobs/pipeline.py` (see the function's own docstring on
why: it would double live Gemini quota usage on low-coverage scans).
Mocks `structure()` itself so no real Gemini call happens and the retry
budget can be asserted precisely."""

from __future__ import annotations

from unittest.mock import patch

from app.services.extraction.schema import ExtractedField, StructuredExtraction
from app.services.ocr.gemini import structure_with_coverage_retry

REQUIRED = ["manufacturer", "generic_name", "mrp"]


def _field(value: str | None, not_detected: bool) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=[], extraction_confidence=0.0)


def _extraction(**overrides) -> StructuredExtraction:
    base = dict(
        manufacturer=_field(None, True),
        generic_name=_field(None, True),
        net_quantity=_field(None, True),
        manufacture_or_import_date=_field(None, True),
        mrp=_field(None, True),
        consumer_care=_field(None, True),
    )
    base.update(overrides)
    return StructuredExtraction(**base)


def test_adequate_coverage_calls_structure_exactly_once() -> None:
    good = _extraction(
        manufacturer=_field("Test Mfg", False),
        generic_name=_field("Widget", False),
        mrp=_field("Rs 100", False),
    )
    with patch("app.services.ocr.gemini.structure", return_value=good) as mock_structure:
        result = structure_with_coverage_retry(
            blocks=[], angle_by_image_id={}, settings=object(),
            required_field_ids=REQUIRED, coverage_threshold=0.5, max_retries=1,
        )
    assert mock_structure.call_count == 1
    assert result.manufacturer.value == "Test Mfg"


def test_inadequate_coverage_retries_exactly_once_never_more() -> None:
    poor = _extraction()  # everything not_detected -> 0% coverage
    still_poor = _extraction()  # retry also finds nothing
    with patch("app.services.ocr.gemini.structure", side_effect=[poor, still_poor]) as mock_structure:
        structure_with_coverage_retry(
            blocks=[], angle_by_image_id={}, settings=object(),
            required_field_ids=REQUIRED, coverage_threshold=0.5, max_retries=1,
        )
    assert mock_structure.call_count == 2  # first pass + exactly one retry, never a third


def test_retry_merges_newly_found_fields_without_discarding_prior_finds() -> None:
    first_pass = _extraction(manufacturer=_field("Test Mfg", False))  # found mfg, missed the rest
    retry_pass = _extraction(
        generic_name=_field("Widget", False), mrp=_field("Rs 100", False)
    )  # retry finds the other two (but not mfg -- it wasn't asked to look for it again)
    with patch("app.services.ocr.gemini.structure", side_effect=[first_pass, retry_pass]):
        result = structure_with_coverage_retry(
            blocks=[], angle_by_image_id={}, settings=object(),
            required_field_ids=REQUIRED, coverage_threshold=0.9, max_retries=1,
        )
    assert result.manufacturer.value == "Test Mfg"  # kept from the first pass
    assert result.generic_name.value == "Widget"  # merged in from the retry
    assert result.mrp.value == "Rs 100"


def test_retry_never_overwrites_an_already_found_field_with_a_worse_result() -> None:
    first_pass = _extraction(
        manufacturer=_field("Test Mfg", False), generic_name=_field(None, True)
    )
    # A hypothetical bad retry that "loses" a field it shouldn't touch --
    # missing_field_hint only ever includes generic_name/mrp here, so the
    # retry pass's own manufacturer value (even if present) must never
    # replace the first pass's.
    retry_pass = _extraction(
        manufacturer=_field("Wrong Name", False), generic_name=_field("Widget", False)
    )
    with patch("app.services.ocr.gemini.structure", side_effect=[first_pass, retry_pass]):
        result = structure_with_coverage_retry(
            blocks=[], angle_by_image_id={}, settings=object(),
            required_field_ids=["manufacturer", "generic_name"], coverage_threshold=0.9, max_retries=1,
        )
    assert result.manufacturer.value == "Test Mfg"  # never overwritten
    assert result.generic_name.value == "Widget"


def test_zero_max_retries_never_calls_structure_twice() -> None:
    poor = _extraction()
    with patch("app.services.ocr.gemini.structure", return_value=poor) as mock_structure:
        structure_with_coverage_retry(
            blocks=[], angle_by_image_id={}, settings=object(),
            required_field_ids=REQUIRED, coverage_threshold=0.5, max_retries=0,
        )
    assert mock_structure.call_count == 1
