"""
Unit tests for checks.py's check_rule_9_readability() — pure, no DB/S3.
"""

from __future__ import annotations

from app.services.extraction.schema import EvidenceRef, ExtractedField, ImageQualitySummary, StructuredExtraction
from app.services.rules.checks import check_rule_9_readability
from app.services.rules.types import RuleStatus


def _field(value, confidence=90.0, not_detected=False, bbox=(10.0, 10.0, 60.0, 30.0), angle="front") -> ExtractedField:
    evidence = [] if not_detected else [
        EvidenceRef(image_id="img-1", image_angle=angle, provider="paddleocr", bbox=bbox, ocr_confidence=confidence)
    ]
    return ExtractedField(value=value, not_detected=not_detected, evidence=evidence, extraction_confidence=confidence)


def _extraction(mrp_confidence=90.0, mrp_bbox=(10.0, 10.0, 60.0, 30.0), language="English") -> StructuredExtraction:
    empty = ExtractedField(value=None, not_detected=True)
    return StructuredExtraction(
        manufacturer=_field("Acme", angle="front"),
        generic_name=_field("Widget", angle="front"),
        net_quantity=_field("1 kg", angle="front"),
        mrp=_field("Rs 100", confidence=mrp_confidence, bbox=mrp_bbox, angle="front"),
        manufacture_or_import_date=empty, consumer_care=empty,
        language_detected=language,
    )


_GOOD_FRONT_QUALITY = [ImageQualitySummary(image_id="img-1", angle="front", overall_verdict="PASS")]


# --- (5) high-quality readable text -> PASS ---------------------------------

def test_high_confidence_good_quality_is_pass():
    extraction = _extraction(mrp_confidence=95.0)
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.PASS


# --- (6) borderline readability -> NEEDS_REVIEW -----------------------------

def test_borderline_confidence_is_needs_review():
    extraction = _extraction(mrp_confidence=55.0)
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.NEEDS_REVIEW


def test_review_verdict_image_quality_is_needs_review():
    review_quality = [ImageQualitySummary(image_id="img-1", angle="front", overall_verdict="REVIEW")]
    extraction = _extraction(mrp_confidence=95.0)
    result = check_rule_9_readability(extraction, review_quality, total_ocr_blocks=5)
    assert result.status == RuleStatus.NEEDS_REVIEW


def test_unresolved_language_is_needs_review():
    extraction = _extraction(mrp_confidence=95.0, language="Klingon")
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.NEEDS_REVIEW


# --- (7) unusable image -> INSUFFICIENT_EVIDENCE ----------------------------

def test_recapture_required_quality_is_insufficient_evidence():
    bad_quality = [ImageQualitySummary(
        image_id="img-1", angle="front", overall_verdict="RECAPTURE_REQUIRED",
        checks=[{"name": "blur", "passed": False, "score": 10.0, "threshold": 50.0, "verdict": "RECAPTURE_REQUIRED"}],
    )]
    extraction = _extraction(mrp_confidence=95.0)
    result = check_rule_9_readability(extraction, bad_quality, total_ocr_blocks=5)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_too_few_ocr_blocks_is_insufficient_evidence():
    extraction = _extraction(mrp_confidence=95.0)
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=1)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_no_quality_data_for_angle_is_insufficient_evidence():
    extraction = _extraction(mrp_confidence=95.0)
    result = check_rule_9_readability(extraction, image_quality_results=[], total_ocr_blocks=5)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


# --- (8) OCR failure alone does not automatically become FAIL --------------

def test_field_not_detected_is_not_fail():
    """A field that was never detected at all is Rule 6's presence concern,
    not this rule's — must never surface as a readability FAIL."""
    empty = ExtractedField(value=None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=empty, generic_name=empty, net_quantity=empty, mrp=empty,
        manufacture_or_import_date=empty, consumer_care=empty, language_detected=None,
    )
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.status != RuleStatus.FAIL
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_genuine_illegibility_under_good_conditions_is_fail():
    extraction = _extraction(mrp_confidence=10.0)
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.FAIL


def test_degenerate_bbox_evidence_is_review_not_fail():
    """Text detected only via the Gemini whole-image fallback (no real
    geometry) is borderline, never a confirmed illegibility FAIL."""
    extraction = _extraction(mrp_confidence=10.0, mrp_bbox=(0.0, 0.0, 1.0, 1.0))
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.status != RuleStatus.FAIL


def test_rule_id_and_field_id_unchanged_from_prior_contract():
    extraction = _extraction()
    result = check_rule_9_readability(extraction, _GOOD_FRONT_QUALITY, total_ocr_blocks=5)
    assert result.rule_id == "rule_9_language"
    assert result.field_id == "languageReadability"
