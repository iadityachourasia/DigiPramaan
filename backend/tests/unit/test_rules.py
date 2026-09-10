"""
Unit tests for app/services/rules/ — pure, deterministic, no mocking at
all. The original Phase 3 fixtures (A-F below) predate the Phase 3.1
adequate-evidence distinction and are updated here to pass an explicit
`evidence_adequate` flag; Phase 3.1's own required demo cases (A-E, per
that task's DEMO PROOF section) live further down, clearly labeled.
"""

from __future__ import annotations

from app.services.extraction.schema import ExtractedField, ImageQualitySummary, StructuredExtraction
from app.services.rules.aggregate import compute_compliance_score, compute_legal_status
from app.services.rules.checks import (
    check_country_of_origin,
    check_rule_3_applicability,
    check_rule_6_2_consumer_care_completeness,
    check_rule_6_consumer_care,
    check_rule_6b_generic_name,
    check_rule_6e_mrp,
    check_rule_7_font_size,
    run_all_rule_checks,
)
from app.services.rules.types import RuleResolution, RuleResult, RuleStatus


def _field(value: str | None = "x", not_detected: bool = False) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=[], extraction_confidence=0.0)


def _empty_extraction(**overrides) -> StructuredExtraction:
    empty = _field(value=None, not_detected=True)
    base = dict(
        manufacturer=empty, packer=empty, importer=empty, brand_owner_or_marketer=empty,
        generic_name=empty, net_quantity=empty, manufacture_or_import_date=empty, mrp=empty,
        consumer_care=empty, country_of_origin=empty, address=empty,
        quantity_unit_expression=empty, language_detected=None,
    )
    base.update(overrides)
    return StructuredExtraction(**base)


def _rule_result(status: RuleStatus, rule_id: str = "x") -> RuleResult:
    return RuleResult(rule_id=rule_id, rule_name="x", field_id="x", status=status, message="x", legal_basis="x")


# --- A. Compliant package ---------------------------------------------

def test_a_synthetic_all_pass_aggregates_to_compliant() -> None:
    """Pure aggregation-logic test: a hand-built list where even the
    Rule-7 stand-in is PASS (never the case in real pipeline runs, where
    check_rule_7_font_size() always returns INSUFFICIENT_EVIDENCE — see
    fixture D) — compute_legal_status only looks at the list it's given."""
    results = [
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        _rule_result(RuleStatus.PASS, "rule_7_font_size"),  # stand-in, not the real function
    ]
    assert compute_legal_status(results) == "Compliant"


# --- B. Missing mandatory declaration -----------------------------------

def test_b_not_detected_generic_name_is_needs_review_when_evidence_inadequate() -> None:
    extraction = _empty_extraction(generic_name=_field(value=None, not_detected=True))
    result = check_rule_6b_generic_name(extraction.generic_name, evidence_adequate=False)
    assert result.status == RuleStatus.NEEDS_REVIEW


def test_b_not_detected_generic_name_is_fail_when_evidence_adequate() -> None:
    """Phase 3.1: a genuinely-absent mandatory field with a clear,
    adequately-searched image is FAIL, not NEEDS_REVIEW."""
    extraction = _empty_extraction(generic_name=_field(value=None, not_detected=True))
    result = check_rule_6b_generic_name(extraction.generic_name, evidence_adequate=True)
    assert result.status == RuleStatus.FAIL


# --- C. Invalid MRP / unit expression ------------------------------------

def test_c_mrp_present_without_tax_wording_fails() -> None:
    result = check_rule_6e_mrp(_field(value="MRP Rs. 99", not_detected=False), evidence_adequate=False)
    assert result.status == RuleStatus.FAIL


def test_c_mrp_with_tax_wording_passes() -> None:
    result = check_rule_6e_mrp(
        _field(value="MRP Rs. 99 (inclusive of all taxes)", not_detected=False), evidence_adequate=False
    )
    assert result.status == RuleStatus.PASS


# --- D. Rule 7 insufficient evidence, always ------------------------------

def test_d_rule_7_always_insufficient_evidence() -> None:
    assert check_rule_7_font_size().status == RuleStatus.INSUFFICIENT_EVIDENCE
    # Never fabricates a measurement regardless of what it's given.
    assert check_rule_7_font_size().status == RuleStatus.INSUFFICIENT_EVIDENCE


# --- E. Unresolved review case --------------------------------------------

def test_e_one_unresolved_needs_review_forces_overall_needs_review() -> None:
    results = [
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        _rule_result(RuleStatus.NEEDS_REVIEW, "rule_9_language"),
    ]
    assert compute_legal_status(results) == "Needs Review"
    # Not a single FAIL anywhere.
    assert not any(r.status == RuleStatus.FAIL for r in results)


# --- F. Officer correction changing a rule result -------------------------

def test_f_correcting_a_not_detected_field_flips_needs_review_to_pass() -> None:
    before = check_rule_6_consumer_care(_field(value=None, not_detected=True), evidence_adequate=False)
    assert before.status == RuleStatus.NEEDS_REVIEW

    corrected_field = ExtractedField(
        value="care@example.com", not_detected=False, evidence=[], extraction_confidence=0.0,
        corrected=True, corrected_by="officer-1",
    )
    after = check_rule_6_consumer_care(corrected_field, evidence_adequate=False)
    assert after.status == RuleStatus.PASS

    before_status = compute_legal_status([
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        before,
    ])
    after_status = compute_legal_status([
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        after,
    ])
    assert before_status == "Needs Review"
    assert after_status == "Compliant"


# --- Rule 3 short-circuit --------------------------------------------------

def test_rule_3_not_applicable_short_circuits_everything_else() -> None:
    results = [
        _rule_result(RuleStatus.NOT_APPLICABLE, "rule_3_applicability"),
        _rule_result(RuleStatus.FAIL, "rule_6a_manufacturer"),
        _rule_result(RuleStatus.FAIL, "rule_6e_mrp"),
    ]
    assert compute_legal_status(results) == "Not Applicable"


def test_rule_3_bulk_quantity_is_not_applicable() -> None:
    result = check_rule_3_applicability(category="Packaged Food", net_quantity=_field(value="30 kg"))
    assert result.status == RuleStatus.NOT_APPLICABLE


def test_rule_3_normal_retail_quantity_is_pass() -> None:
    result = check_rule_3_applicability(category="Packaged Food", net_quantity=_field(value="1 L"))
    assert result.status == RuleStatus.PASS


# --- Country of origin --------------------------------------------------

def test_country_of_origin_not_applicable_without_import_evidence() -> None:
    result = check_country_of_origin(
        country_of_origin=_field(value=None, not_detected=True),
        importer=_field(value=None, not_detected=True),
        evidence_adequate=True,  # irrelevant here — NOT_APPLICABLE wins regardless
    )
    assert result.status == RuleStatus.NOT_APPLICABLE


def test_country_of_origin_needs_review_when_importer_present_but_country_missing() -> None:
    result = check_country_of_origin(
        country_of_origin=_field(value=None, not_detected=True),
        importer=_field(value="Acme Imports Pvt Ltd", not_detected=False),
        evidence_adequate=False,
    )
    assert result.status == RuleStatus.NEEDS_REVIEW


def test_country_of_origin_fail_when_importer_present_and_evidence_adequate() -> None:
    result = check_country_of_origin(
        country_of_origin=_field(value=None, not_detected=True),
        importer=_field(value="Acme Imports Pvt Ltd", not_detected=False),
        evidence_adequate=True,
    )
    assert result.status == RuleStatus.FAIL


# --- Score independence from legal status --------------------------------

def test_compliance_score_independent_of_legal_status() -> None:
    needs_review_heavy = [
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.NEEDS_REVIEW, "a"),
        _rule_result(RuleStatus.NEEDS_REVIEW, "b"),
        _rule_result(RuleStatus.NEEDS_REVIEW, "c"),
    ]
    all_fail = [
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.FAIL, "d"),
        _rule_result(RuleStatus.FAIL, "e"),
        _rule_result(RuleStatus.FAIL, "f"),
    ]
    assert compute_legal_status(needs_review_heavy) == "Needs Review"
    assert compute_legal_status(all_fail) == "Non-Compliant"
    # Both have the same PASS ratio among scored rules (1/4 counting rule_3
    # itself, or identical 0/3 among the non-rule_3 rules) — the point is
    # the score formula never looks at *which* non-PASS status fired, only
    # PASS vs. not-PASS, so two very different legal statuses can share a
    # score, proving no coupling.
    score_a = compute_compliance_score(needs_review_heavy)
    score_b = compute_compliance_score(all_fail)
    assert score_a["value"] == score_b["value"]


def test_consumer_care_completeness_needs_review_when_not_detected_and_evidence_inadequate() -> None:
    result = check_rule_6_2_consumer_care_completeness(_field(value=None, not_detected=True), evidence_adequate=False)
    assert result.status == RuleStatus.NEEDS_REVIEW


def test_consumer_care_completeness_fail_when_not_detected_and_evidence_adequate() -> None:
    result = check_rule_6_2_consumer_care_completeness(_field(value=None, not_detected=True), evidence_adequate=True)
    assert result.status == RuleStatus.FAIL


def test_run_all_rule_checks_returns_full_roster() -> None:
    extraction = _empty_extraction(
        manufacturer=_field("Acme"), generic_name=_field("Widget"), net_quantity=_field("1 kg"),
        manufacture_or_import_date=_field("01/2026"),
        mrp=_field("Rs 100 inclusive of all taxes"),
        consumer_care=_field("1800-000-0000"),
        language_detected="English",
    )
    results = run_all_rule_checks(extraction, category="Packaged Food")
    assert len(results) == 15
    assert {r.rule_id for r in results} == {
        "rule_3_applicability", "rule_6a_manufacturer", "rule_6b_generic_name",
        "rule_6c_net_quantity", "rule_6d_manufacture_date", "rule_6e_mrp",
        "rule_6_consumer_care", "rule_6_2_consumer_care_completeness", "country_of_origin",
        "rule_10_address", "rules_11_13_quantity_unit", "rule_9_language",
        "rule_8_pdp_presence", "rule_7_font_size", "rule_6_3_sticker",
    }


# ======================================================================
# Phase 3.1 DEMO PROOF — the 5 cases required by that task, verbatim:
#   A. mandatory consumer-care genuinely absent with adequate evidence => FAIL / NON_COMPLIANT
#   B. text unreadable/cropped => NEEDS_REVIEW, not FAIL
#   C. Rule 7 no calibration => INSUFFICIENT_EVIDENCE
#   D. officer resolves Rule 7 PASS => original automated result retained, effective result PASS
#   E. officer resolves a review item FAIL => final status becomes NON_COMPLIANT
# ======================================================================

_PASS_QUALITY_BACK = [ImageQualitySummary(image_id="back-1", angle="back", overall_verdict="PASS")]
_REVIEW_QUALITY_BACK = [ImageQualitySummary(image_id="back-1", angle="back", overall_verdict="REVIEW")]


def test_phase31_a_consumer_care_absent_with_adequate_evidence_is_fail_and_non_compliant() -> None:
    """A. Mandatory consumer-care genuinely absent, back image PASSED
    quality review, and the scan found plenty of OCR text overall (a real
    search happened) — treated as a confirmed violation, not a guess."""
    extraction = _empty_extraction(
        manufacturer=_field("Acme"), generic_name=_field("Widget"), net_quantity=_field("1 kg"),
        manufacture_or_import_date=_field("01/2026"), mrp=_field("Rs 100 inclusive of all taxes"),
        consumer_care=_field(value=None, not_detected=True),  # genuinely absent
        language_detected="English",
    )
    results = run_all_rule_checks(
        extraction, category="Packaged Food",
        image_quality_results=_PASS_QUALITY_BACK, total_ocr_blocks=10,
    )
    consumer_care_result = next(r for r in results if r.rule_id == "rule_6_consumer_care")
    assert consumer_care_result.status == RuleStatus.FAIL

    # Aggregate on a controlled list (isolating just this FAIL against
    # otherwise-clean PASSes) — run_all_rule_checks' full roster also
    # includes rules that are NEEDS_REVIEW by default absent further test
    # setup (e.g. Rule 8 PDP presence, with no evidence populated on any
    # field in this minimal fixture), which would obscure the point of
    # this specific demo case.
    assert compute_legal_status([
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        consumer_care_result,
    ]) == "Non-Compliant"


def test_phase31_b_ambiguous_evidence_is_needs_review_not_fail() -> None:
    """B. Same genuinely-absent consumer care, but the back image only hit
    REVIEW quality (borderline — blurry/dark/cropped) — the absence is
    ambiguous, not confirmed, so this must NEVER be FAIL."""
    extraction = _empty_extraction(
        manufacturer=_field("Acme"), generic_name=_field("Widget"), net_quantity=_field("1 kg"),
        manufacture_or_import_date=_field("01/2026"), mrp=_field("Rs 100 inclusive of all taxes"),
        consumer_care=_field(value=None, not_detected=True),
        language_detected="English",
    )
    results = run_all_rule_checks(
        extraction, category="Packaged Food",
        image_quality_results=_REVIEW_QUALITY_BACK, total_ocr_blocks=10,
    )
    consumer_care_result = next(r for r in results if r.rule_id == "rule_6_consumer_care")
    assert consumer_care_result.status == RuleStatus.NEEDS_REVIEW

    # Also true when quality is PASS but the scan barely read any text at
    # all (a thin/failed search, distinct from per-image blur/darkness).
    results_thin_search = run_all_rule_checks(
        extraction, category="Packaged Food",
        image_quality_results=_PASS_QUALITY_BACK, total_ocr_blocks=1,
    )
    thin_search_result = next(r for r in results_thin_search if r.rule_id == "rule_6_consumer_care")
    assert thin_search_result.status == RuleStatus.NEEDS_REVIEW


def test_phase31_c_rule_7_always_insufficient_evidence_no_calibration() -> None:
    """C. Rule 7 without physical calibration — always INSUFFICIENT_EVIDENCE,
    regardless of how adequate the surrounding evidence otherwise is."""
    assert check_rule_7_font_size().status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_phase31_d_officer_resolves_rule_7_pass_original_result_retained() -> None:
    """D. An officer resolves Rule 7 to PASS after a real physical
    measurement — the ORIGINAL automated RuleResult.status must remain
    INSUFFICIENT_EVIDENCE (never overwritten); only effective_status,
    which aggregation/the checklist actually use, becomes PASS."""
    rule_7_result = check_rule_7_font_size()
    assert rule_7_result.status == RuleStatus.INSUFFICIENT_EVIDENCE
    assert rule_7_result.resolution is None

    rule_7_result.resolution = RuleResolution(
        resolved_status=RuleStatus.PASS, resolved_by="officer-42",
        resolved_at="2026-09-10T12:00:00+00:00",
        note="Measured 4.2mm numeral height with a ruler in person — meets Rule 7.",
    )

    # Original automated verdict survives, untouched.
    assert rule_7_result.status == RuleStatus.INSUFFICIENT_EVIDENCE
    # Effective status — what aggregation/the checklist use — is PASS.
    assert rule_7_result.effective_status == RuleStatus.PASS

    legal_status = compute_legal_status([
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        rule_7_result,
    ])
    assert legal_status == "Compliant"


def test_phase31_e_officer_resolves_review_item_fail_becomes_non_compliant() -> None:
    """E. An officer resolves an unresolved NEEDS_REVIEW/INSUFFICIENT_EVIDENCE
    item to FAIL (e.g. confirms in person that a declaration is genuinely
    missing after all) — the overall legal status becomes NON_COMPLIANT."""
    review_result = check_rule_6_2_consumer_care_completeness(
        _field(value=None, not_detected=True), evidence_adequate=False
    )
    assert review_result.status == RuleStatus.NEEDS_REVIEW

    before_status = compute_legal_status([
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        review_result,
    ])
    assert before_status == "Needs Review"

    review_result.resolution = RuleResolution(
        resolved_status=RuleStatus.FAIL, resolved_by="officer-42",
        resolved_at="2026-09-10T12:05:00+00:00",
        note="Inspected in person — no consumer care contact printed anywhere on the pack.",
    )
    assert review_result.status == RuleStatus.NEEDS_REVIEW  # original never overwritten
    assert review_result.effective_status == RuleStatus.FAIL

    after_status = compute_legal_status([
        _rule_result(RuleStatus.PASS, "rule_3_applicability"),
        _rule_result(RuleStatus.PASS, "rule_6a_manufacturer"),
        review_result,
    ])
    assert after_status == "Non-Compliant"
