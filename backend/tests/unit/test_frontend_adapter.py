"""
Unit tests for app/services/rules/frontend_adapter.py — pure, no mocking.
"""

from __future__ import annotations

from app.services.rules.frontend_adapter import to_checklist_and_violations
from app.services.rules.types import RuleResult, RuleStatus


def _result(rule_id: str, field_id: str, status: RuleStatus, message: str = "msg",
            legal_basis: str = "Rule X", value: str | None = None) -> RuleResult:
    return RuleResult(
        rule_id=rule_id, rule_name=rule_id, field_id=field_id,
        status=status, message=message, legal_basis=legal_basis, value=value,
    )


def test_not_applicable_excluded_from_checklist() -> None:
    results = [_result("rule_x", "someField", RuleStatus.NOT_APPLICABLE)]
    checklist, violations = to_checklist_and_violations(results)
    assert checklist == []
    assert violations == []


def test_rule3_applicability_always_excluded_regardless_of_status() -> None:
    for status in (RuleStatus.PASS, RuleStatus.NOT_APPLICABLE):
        results = [_result("rule_3_applicability", "rule3Applicability", status)]
        checklist, _ = to_checklist_and_violations(results)
        assert checklist == []


def test_pass_becomes_passing_checklist_row() -> None:
    results = [_result("rule_6a_manufacturer", "manufacturerDetails", RuleStatus.PASS, value="Acme")]
    checklist, violations = to_checklist_and_violations(results)
    assert checklist == [{"fieldId": "manufacturerDetails", "passed": True, "value": "Acme"}]
    assert violations == []


def test_fail_becomes_failing_checklist_row_and_a_violation() -> None:
    results = [_result(
        "rule_6e_mrp", "retailSalePrice", RuleStatus.FAIL,
        message="missing tax wording", legal_basis="Rule 6(e)/2(m)", value="Rs 99",
    )]
    checklist, violations = to_checklist_and_violations(results)
    assert checklist == [{
        "fieldId": "retailSalePrice", "passed": False, "value": "Rs 99",
        "violationCategoryId": "mrp-non-compliance", "detail": "missing tax wording",
    }]
    assert violations == [{
        "categoryId": "mrp-non-compliance", "category": "MRP Non-Compliance",
        "legalBasis": "Rule 6(e)/2(m)", "detail": "missing tax wording",
    }]


def test_needs_review_becomes_checklist_row_without_violation() -> None:
    results = [_result("rule_9_language", "languageReadability", RuleStatus.NEEDS_REVIEW, message="unclear")]
    checklist, violations = to_checklist_and_violations(results)
    assert len(checklist) == 1
    assert checklist[0]["passed"] is False
    assert "violationCategoryId" not in checklist[0]
    assert violations == []


def test_insufficient_evidence_becomes_checklist_row_without_violation() -> None:
    results = [_result("rule_7_font_size", "fontSize", RuleStatus.INSUFFICIENT_EVIDENCE, message="no calibration")]
    checklist, violations = to_checklist_and_violations(results)
    assert len(checklist) == 1
    assert checklist[0]["passed"] is False
    assert "violationCategoryId" not in checklist[0]
    assert violations == []


def test_unmapped_fail_rule_falls_back_to_other_category() -> None:
    results = [_result("rule_10_address", "addressCompleteness", RuleStatus.FAIL, message="no PIN code")]
    checklist, violations = to_checklist_and_violations(results)
    assert checklist[0]["violationCategoryId"] == "other"
    assert violations[0]["categoryId"] == "other"
    assert violations[0]["category"] == "Other"


def test_consumer_care_merge_fail_wins_over_pass() -> None:
    results = [
        _result("rule_6_consumer_care", "consumerCareDetails", RuleStatus.PASS, value="1800-000-0000"),
        _result("rule_6_2_consumer_care_completeness", "consumerCareDetails", RuleStatus.FAIL,
                message="incomplete", legal_basis="Rule 6(2)"),
    ]
    checklist, violations = to_checklist_and_violations(results)
    # Exactly one consumerCareDetails row, not two.
    consumer_care_rows = [c for c in checklist if c["fieldId"] == "consumerCareDetails"]
    assert len(consumer_care_rows) == 1
    assert consumer_care_rows[0]["passed"] is False
    assert consumer_care_rows[0]["violationCategoryId"] == "consumer-care-details-missing"
    assert len(violations) == 1


def test_consumer_care_merge_needs_review_wins_over_pass() -> None:
    results = [
        _result("rule_6_consumer_care", "consumerCareDetails", RuleStatus.NEEDS_REVIEW, message="not detected"),
        _result("rule_6_2_consumer_care_completeness", "consumerCareDetails", RuleStatus.NOT_APPLICABLE),
    ]
    checklist, violations = to_checklist_and_violations(results)
    consumer_care_rows = [c for c in checklist if c["fieldId"] == "consumerCareDetails"]
    assert len(consumer_care_rows) == 1
    assert consumer_care_rows[0]["passed"] is False
    assert "violationCategoryId" not in consumer_care_rows[0]
    assert violations == []


def test_mrp_category_mapping() -> None:
    results = [_result("rule_6e_mrp", "retailSalePrice", RuleStatus.FAIL)]
    _, violations = to_checklist_and_violations(results)
    assert violations[0]["categoryId"] == "mrp-non-compliance"
