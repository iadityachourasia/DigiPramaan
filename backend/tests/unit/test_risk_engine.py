"""
Unit tests for app/services/risk/engine.py — pure, no DB. Fake
ComplianceRecord-like objects (same "plain class with only the attributes
actually accessed" convention already established in test_pipeline.py)
stand in for real rows.
"""

from __future__ import annotations

import datetime
import uuid

from app.services.risk.engine import aggregate_score, evaluate_company_rules, evaluate_product_rules

_NOW = datetime.datetime.now(datetime.timezone.utc)


def _record(compliance_status="Non-Compliant", violations=None, verified_at=None, record_id=None):
    class _Record:
        pass

    r = _Record()
    r.id = record_id or uuid.uuid4()
    r.compliance_status = compliance_status
    r.violations = violations or []
    r.verified_at = verified_at if verified_at is not None else _NOW
    return r


def _violation(category_id: str) -> dict:
    return {"categoryId": category_id, "category": category_id, "legalBasis": "x", "detail": "x"}


# --- R2: repeat SAME product violation -------------------------------------

def test_r2_triggers_on_same_category_repeated_twice() -> None:
    records = [
        _record(violations=[_violation("mrp-non-compliance")]),
        _record(violations=[_violation("mrp-non-compliance")]),
    ]
    triggered = evaluate_product_rules(records, open_case_count=0)
    r2 = next((t for t in triggered if t["rule_id"] == "R2"), None)
    assert r2 is not None
    assert len(r2["evidence_record_ids"]) == 2
    assert "MRP Non-Compliance" in r2["reason"]


def test_r2_does_not_trigger_on_two_unrelated_non_compliant_records() -> None:
    """CORRECTED requirement: 2 non-compliant records with DIFFERENT
    violation categories must NOT trigger R2 — only a repeated SAME
    category does."""
    records = [
        _record(violations=[_violation("mrp-non-compliance")]),
        _record(violations=[_violation("consumer-care-details-missing")]),
    ]
    triggered = evaluate_product_rules(records, open_case_count=0)
    assert not any(t["rule_id"] == "R2" for t in triggered)


def test_r2_does_not_trigger_on_a_single_violation() -> None:
    records = [_record(violations=[_violation("mrp-non-compliance")])]
    triggered = evaluate_product_rules(records, open_case_count=0)
    assert not any(t["rule_id"] == "R2" for t in triggered)


# --- R1: repeat SAME company violation --------------------------------------

def test_r1_triggers_on_same_category_repeated_three_times_within_window() -> None:
    records = [_record(violations=[_violation("mrp-non-compliance")]) for _ in range(3)]
    triggered = evaluate_company_rules(records, product_id_by_record={}, open_case_count=0)
    r1 = next((t for t in triggered if t["rule_id"] == "R1"), None)
    assert r1 is not None
    assert len(r1["evidence_record_ids"]) == 3


def test_r1_does_not_trigger_on_three_unrelated_non_compliant_records() -> None:
    """CORRECTED requirement: 3 non-compliant records with 3 DIFFERENT
    categories must NOT trigger R1."""
    records = [
        _record(violations=[_violation("mrp-non-compliance")]),
        _record(violations=[_violation("consumer-care-details-missing")]),
        _record(violations=[_violation("generic-name-missing-or-incorrect")]),
    ]
    triggered = evaluate_company_rules(records, product_id_by_record={}, open_case_count=0)
    assert not any(t["rule_id"] == "R1" for t in triggered)


def test_r1_ignores_violations_outside_the_repeat_window() -> None:
    old = _NOW - datetime.timedelta(days=200)
    records = [_record(violations=[_violation("mrp-non-compliance")], verified_at=old) for _ in range(3)]
    triggered = evaluate_company_rules(records, product_id_by_record={}, open_case_count=0)
    assert not any(t["rule_id"] == "R1" for t in triggered)


# --- R3: multiple distinct non-compliant products ---------------------------

def test_r3_triggers_on_two_distinct_non_compliant_products() -> None:
    product_a, product_b = uuid.uuid4(), uuid.uuid4()
    r1_, r2_ = _record(compliance_status="Non-Compliant"), _record(compliance_status="Non-Compliant")
    triggered = evaluate_company_rules(
        [r1_, r2_], product_id_by_record={r1_.id: product_a, r2_.id: product_b}, open_case_count=0,
    )
    assert any(t["rule_id"] == "R3" for t in triggered)


def test_r3_does_not_trigger_on_a_single_non_compliant_product() -> None:
    product_a = uuid.uuid4()
    r1_ = _record(compliance_status="Non-Compliant")
    triggered = evaluate_company_rules([r1_], product_id_by_record={r1_.id: product_a}, open_case_count=0)
    assert not any(t["rule_id"] == "R3" for t in triggered)


# --- R4: open enforcement case ------------------------------------------

def test_r4_triggers_for_company_when_open_case_count_positive() -> None:
    triggered = evaluate_company_rules([], product_id_by_record={}, open_case_count=1)
    assert any(t["rule_id"] == "R4" for t in triggered)


def test_r4_triggers_for_product_when_open_case_count_positive() -> None:
    triggered = evaluate_product_rules([], open_case_count=1)
    assert any(t["rule_id"] == "R4" for t in triggered)


def test_r4_does_not_trigger_when_no_open_cases() -> None:
    assert not any(t["rule_id"] == "R4" for t in evaluate_product_rules([], open_case_count=0))
    assert not any(t["rule_id"] == "R4" for t in evaluate_company_rules([], {}, open_case_count=0))


# --- aggregate_score ---------------------------------------------------

def test_aggregate_score_matches_the_task_worked_example() -> None:
    triggered = [
        {"rule_id": "R1", "score_contribution": 25, "reason": "a", "evidence_record_ids": []},
        {"rule_id": "R2", "score_contribution": 25, "reason": "b", "evidence_record_ids": []},
        {"rule_id": "R4", "score_contribution": 25, "reason": "c", "evidence_record_ids": []},
    ]
    result = aggregate_score(triggered)
    assert result["value"] == 75
    assert result["band"] == "HIGH"


def test_aggregate_score_caps_at_100() -> None:
    triggered = [{"rule_id": r, "score_contribution": 25, "reason": r, "evidence_record_ids": []} for r in "ABCDE"]
    result = aggregate_score(triggered)
    assert result["value"] == 100
    assert result["band"] == "CRITICAL"


def test_aggregate_score_no_triggers_is_low() -> None:
    result = aggregate_score([])
    assert result["value"] == 0
    assert result["band"] == "LOW"
