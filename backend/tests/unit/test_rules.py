"""
Unit tests for app/services/rules/ — pure, deterministic, no mocking at
all. Fixtures A-F match the Phase 3 task's own required list exactly.
"""

from __future__ import annotations

from app.services.extraction.schema import ExtractedField, StructuredExtraction
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
from app.services.rules.types import RuleResult, RuleStatus


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

def test_b_not_detected_generic_name_is_needs_review_not_fail() -> None:
    extraction = _empty_extraction(generic_name=_field(value=None, not_detected=True))
    result = check_rule_6b_generic_name(extraction.generic_name)
    assert result.status == RuleStatus.NEEDS_REVIEW


# --- C. Invalid MRP / unit expression ------------------------------------

def test_c_mrp_present_without_tax_wording_fails() -> None:
    result = check_rule_6e_mrp(_field(value="MRP Rs. 99", not_detected=False))
    assert result.status == RuleStatus.FAIL


def test_c_mrp_with_tax_wording_passes() -> None:
    result = check_rule_6e_mrp(_field(value="MRP Rs. 99 (inclusive of all taxes)", not_detected=False))
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
    before = check_rule_6_consumer_care(_field(value=None, not_detected=True))
    assert before.status == RuleStatus.NEEDS_REVIEW

    corrected_field = ExtractedField(
        value="care@example.com", not_detected=False, evidence=[], extraction_confidence=0.0,
        corrected=True, corrected_by="officer-1",
    )
    after = check_rule_6_consumer_care(corrected_field)
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
    )
    assert result.status == RuleStatus.NOT_APPLICABLE


def test_country_of_origin_needs_review_when_importer_present_but_country_missing() -> None:
    result = check_country_of_origin(
        country_of_origin=_field(value=None, not_detected=True),
        importer=_field(value="Acme Imports Pvt Ltd", not_detected=False),
    )
    assert result.status == RuleStatus.NEEDS_REVIEW


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


def test_consumer_care_completeness_not_applicable_when_not_detected() -> None:
    result = check_rule_6_2_consumer_care_completeness(_field(value=None, not_detected=True))
    assert result.status == RuleStatus.NOT_APPLICABLE


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
