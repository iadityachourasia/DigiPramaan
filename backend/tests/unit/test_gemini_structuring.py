"""OP-Phase 6 — the first dedicated test file for `ocr/gemini.py`'s
`structure()`/`_to_extracted_field` citation-grounding and field-
reliability logic. No live Gemini call — exercises the pure helper
functions and `_to_extracted_field` directly."""

from __future__ import annotations

import json

from app.services.extraction.schema import ExtractedField
from app.services.ocr.gemini import GeminiFieldExtraction, _assess_reliability, _to_extracted_field
from app.services.ocr.provider import OcrBlock


def _block(image_id: str, text: str, confidence: float = 90.0) -> OcrBlock:
    return OcrBlock(image_id=image_id, text=text, confidence=confidence, bbox=(0, 0, 10, 10), provider="paddleocr")


def _gemini_field(value, not_detected, indices, confidence=80.0) -> GeminiFieldExtraction:
    return GeminiFieldExtraction(
        value=value, not_detected=not_detected, source_block_indices=indices, confidence=confidence
    )


ANGLES = {"img-1": "front", "img-2": "back"}


# --- adversarial: an in-bounds citation that doesn't support the value -----


def test_a_citation_to_unrelated_text_is_dropped_but_value_is_kept() -> None:
    blocks = [
        _block("img-1", "Manufacturer: Test Foods Pvt Ltd"),
        _block("img-1", "Address: 123 Industrial Estate, Pune 411001"),
    ]
    # Gemini claims MRP but cites the ADDRESS block — not textually related.
    field = _gemini_field("Rs 120", False, [1])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert result.value == "Rs 120"
    assert result.not_detected is False
    assert result.evidence == []
    assert result.reliability is not None
    assert result.reliability.citation_count == 1
    assert result.reliability.verified_citation_count == 0
    assert result.reliability.has_verified_citation is False


def test_a_grounded_citation_is_kept() -> None:
    blocks = [_block("img-1", "MRP: Rs 120 inclusive of all taxes")]
    field = _gemini_field("Rs 120", False, [0])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert len(result.evidence) == 1
    assert result.evidence[0].ocr_block_text == "MRP: Rs 120 inclusive of all taxes"
    assert result.reliability.verified_citation_count == 1
    assert result.reliability.has_verified_citation is True


# --- multilingual -----------------------------------------------------------


def test_devanagari_value_grounds_against_its_own_devanagari_block() -> None:
    blocks = [_block("img-1", "निर्माता: टेस्ट फूड्स प्राइवेट लिमिटेड")]
    field = _gemini_field("टेस्ट फूड्स प्राइवेट लिमिटेड", False, [0])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert len(result.evidence) == 1, "Devanagari text must not be stripped by the citation normalizer"


def test_devanagari_value_does_not_ground_against_unrelated_devanagari_block() -> None:
    blocks = [_block("img-1", "पता: 123 औद्योगिक क्षेत्र, पुणे")]  # address, unrelated
    field = _gemini_field("टेस्ट फूड्स प्राइवेट लिमिटेड", False, [0])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert result.evidence == [], "a naive ASCII-only normalizer would wrongly match any non-Latin pair"


# --- missing-confidence (Gemini-fallback sentinel) --------------------------


def test_gemini_fallback_block_still_grounds_and_reliability_reflects_real_confidence() -> None:
    # Gemini-fallback OcrBlock convention: confidence=0.0 (a real, if low,
    # measured value — not the same as "no confidence available").
    blocks = [_block("img-1", "Net Quantity: 500 g", confidence=0.0)]
    field = _gemini_field("500 g", False, [0])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert len(result.evidence) == 1
    assert result.reliability.min_ocr_confidence == 0.0  # real value, not fabricated


def test_no_verified_citations_leaves_min_ocr_confidence_none_not_zero() -> None:
    blocks = [_block("img-1", "Address: unrelated")]
    field = _gemini_field("500 g", False, [0])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert result.evidence == []
    assert result.reliability.min_ocr_confidence is None


# --- out-of-bounds citation: pre-existing behavior, unchanged --------------


def test_out_of_bounds_citation_is_silently_dropped() -> None:
    blocks = [_block("img-1", "MRP: Rs 120")]
    field = _gemini_field("Rs 120", False, [0, 5, -1])
    result = _to_extracted_field(field, blocks, ANGLES)

    assert len(result.evidence) == 1
    assert result.reliability.citation_count == 1  # only the in-bounds one counted


def test_none_gemini_field_returns_not_detected_with_no_reliability() -> None:
    result = _to_extracted_field(None, [], ANGLES)
    assert result.not_detected is True
    assert result.reliability is None


# --- _assess_reliability directly -------------------------------------------


def test_assess_reliability_zero_citations() -> None:
    reliability = _assess_reliability([], citation_count=0)
    assert reliability.has_verified_citation is False
    assert reliability.min_ocr_confidence is None
    assert reliability.citation_count == 0
    assert reliability.verified_citation_count == 0


def test_assess_reliability_mixed_grounded_and_ungrounded() -> None:
    from app.services.extraction.schema import EvidenceRef

    evidence = [
        EvidenceRef(image_id="img-1", image_angle="front", provider="paddleocr", ocr_confidence=85.0)
    ]
    reliability = _assess_reliability(evidence, citation_count=3)  # 3 claimed, only 1 verified
    assert reliability.citation_count == 3
    assert reliability.verified_citation_count == 1
    assert reliability.has_verified_citation is True
    assert reliability.min_ocr_confidence == 85.0


# --- backward compatibility: old persisted JSON still deserializes ---------


def test_pre_phase_6_extracted_field_json_still_deserializes() -> None:
    old_shape = {
        "value": "Test Manufacturer",
        "not_detected": False,
        "evidence": [],
        "extraction_confidence": 75.0,
        "corrected": False,
        "corrected_by": None,
        # no "reliability" key at all — this is what a pre-Phase-6 row looks like.
    }
    field = ExtractedField.model_validate(json.loads(json.dumps(old_shape)))
    assert field.reliability is None
    assert field.value == "Test Manufacturer"
