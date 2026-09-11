"""
Unit tests for checks.py's check_rule_8_placement() — pure, no DB/S3/OpenCV.
Exercises PASS/FAIL/NEEDS_REVIEW/INSUFFICIENT_EVIDENCE against hand-built
StructuredExtraction + ImageQualitySummary fixtures.
"""

from __future__ import annotations

from app.services.extraction.schema import EvidenceRef, ExtractedField, ImageQualitySummary, StructuredExtraction
from app.services.rules.checks import check_rule_8_placement
from app.services.rules.types import RuleStatus


def _field(value, evidence=None, not_detected=False) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=evidence or [])


def _pdp_evidence(bbox=(10.0, 10.0, 50.0, 30.0), confidence=90.0) -> EvidenceRef:
    return EvidenceRef(
        image_id="img-pdp", image_angle="side_pdp", provider="paddleocr", bbox=bbox, ocr_confidence=confidence
    )


def _extraction(net_quantity_evidence=None, mrp_evidence=None) -> StructuredExtraction:
    empty = _field(None, not_detected=True)
    return StructuredExtraction(
        manufacturer=_field("Acme"), generic_name=_field("Widget"),
        net_quantity=_field("1 kg", evidence=net_quantity_evidence),
        mrp=_field("Rs 100", evidence=mrp_evidence),
        manufacture_or_import_date=empty, consumer_care=empty,
    )


_ADEQUATE_PDP_QUALITY = [ImageQualitySummary(image_id="img-pdp", angle="side_pdp", overall_verdict="PASS")]


# --- (1) declaration found on correct PDP -> PASS ---------------------------

def test_both_required_fields_found_on_pdp_is_pass():
    extraction = _extraction(net_quantity_evidence=[_pdp_evidence()], mrp_evidence=[_pdp_evidence()])
    result = check_rule_8_placement(extraction, _ADEQUATE_PDP_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.PASS
    assert result.evidence["expectedPanel"] == "side_pdp"


# --- (2) adequate PDP evidence + genuine absence -> FAIL --------------------

def test_adequate_pdp_but_field_absent_is_fail():
    extraction = _extraction(net_quantity_evidence=[_pdp_evidence()], mrp_evidence=[])
    result = check_rule_8_placement(extraction, _ADEQUATE_PDP_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.FAIL
    assert result.evidence["reason"] == "absent_from_required_panel"


# --- (3) ambiguous placement (degenerate bbox) -> NEEDS_REVIEW --------------

def test_degenerate_bbox_evidence_is_needs_review():
    ambiguous = _pdp_evidence(bbox=(0.0, 0.0, 1.0, 1.0))
    extraction = _extraction(net_quantity_evidence=[ambiguous], mrp_evidence=[_pdp_evidence()])
    result = check_rule_8_placement(extraction, _ADEQUATE_PDP_QUALITY, total_ocr_blocks=5)
    assert result.status == RuleStatus.NEEDS_REVIEW
    assert result.evidence["reason"] == "ambiguous_bbox"


# --- (4) inadequate/cropped PDP -> INSUFFICIENT_EVIDENCE --------------------

def test_no_pdp_quality_data_is_insufficient_evidence():
    extraction = _extraction(net_quantity_evidence=[_pdp_evidence()], mrp_evidence=[_pdp_evidence()])
    result = check_rule_8_placement(extraction, image_quality_results=[], total_ocr_blocks=5)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_too_few_ocr_blocks_is_insufficient_evidence():
    extraction = _extraction(net_quantity_evidence=[_pdp_evidence()], mrp_evidence=[_pdp_evidence()])
    result = check_rule_8_placement(extraction, _ADEQUATE_PDP_QUALITY, total_ocr_blocks=1)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_pdp_image_review_verdict_not_pass_is_insufficient_evidence():
    review_quality = [ImageQualitySummary(image_id="img-pdp", angle="side_pdp", overall_verdict="REVIEW")]
    extraction = _extraction(net_quantity_evidence=[_pdp_evidence()], mrp_evidence=[_pdp_evidence()])
    result = check_rule_8_placement(extraction, review_quality, total_ocr_blocks=5)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_no_measurement_defaults_stay_insufficient_evidence():
    """Calling with no image quality context at all degrades safely,
    matching run_all_rule_checks()'s own documented default behavior."""
    extraction = _extraction()
    result = check_rule_8_placement(extraction)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_rule_id_and_field_id_unchanged_from_prior_contract():
    extraction = _extraction(net_quantity_evidence=[_pdp_evidence()], mrp_evidence=[_pdp_evidence()])
    result = check_rule_8_placement(extraction, _ADEQUATE_PDP_QUALITY, total_ocr_blocks=5)
    assert result.rule_id == "rule_8_pdp_presence"
    assert result.field_id == "pdpDeclarationPresence"
