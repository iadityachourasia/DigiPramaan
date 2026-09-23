"""OP-Phase 4 — cross-checks the strict normalized-schema models
(`normalized_schemas.py`) against the real jsonschema validator, the same
pattern `test_openparser_client.py`'s own cross-check test established
for Phase 2's lenient models. Proves the two never silently drift apart."""

from __future__ import annotations

import pytest

from app.services.ocr.openparser.normalized_schemas import NormalizedConfidence, ParsedDocumentStrict
from tests.contract.openparser_fakes import load_fixture
from tests.contract.openparser_schema import validate_against

_BARE_CONFIDENCE_FIXTURES = [
    "confidence_calibrated_false",
    "confidence_scope_answer",
    "confidence_scope_classification",
    "confidence_scope_detection",
    "confidence_scope_geometry",
    "confidence_scope_quality",
    "confidence_scope_recognition",
]


@pytest.mark.parametrize("fixture_name", _BARE_CONFIDENCE_FIXTURES)
def test_normalized_confidence_accepts_every_confidence_fixture_the_real_validator_accepts(
    fixture_name: str,
) -> None:
    instance = load_fixture(fixture_name)
    validate_against("Confidence", instance)
    NormalizedConfidence.model_validate(instance)


def test_parsed_document_strict_accepts_the_canonical_result_fixture() -> None:
    instance = load_fixture("canonical_result_openparser1")
    validate_against("ParsedDocument", instance)
    document = ParsedDocumentStrict.model_validate(instance)
    assert len(document.pages) == 1
    assert len(document.elements) == 2
    assert document.elements[0].locations[0].bbox is not None


@pytest.mark.parametrize(
    "fixture_name",
    ["confidence_present_recognition", "confidence_absent", "confidence_layout_detection_only"],
)
def test_strict_element_model_within_a_full_document_still_reads_embedded_confidence_correctly(
    fixture_name: str,
) -> None:
    """These fixtures are standalone elements (not full documents), so they
    are validated at the Element level directly rather than wrapped."""
    element = load_fixture(fixture_name)
    validate_against("DocumentElement", element)
    from app.services.ocr.openparser.normalized_schemas import Element

    parsed = Element.model_validate(element)
    if "confidence" in element:
        assert parsed.confidence is not None
        assert parsed.confidence.scope == element["confidence"]["scope"]
    else:
        assert parsed.confidence is None
