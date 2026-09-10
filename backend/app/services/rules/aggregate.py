"""
rules/aggregate.py — pure aggregation over a list[RuleResult]: legal status
and compliance score. Neither function calls any check_* function itself —
both operate purely on whatever RuleResult list they're handed, which is
exactly what lets unit tests exercise this logic in isolation with
hand-built fixtures (see tests/unit/test_rules.py fixture A: a synthetic
all-PASS list, including a stand-in for Rule 7, tests THIS aggregation
logic — not the real check_rule_7_font_size(), which always returns
INSUFFICIENT_EVIDENCE and is tested separately).

Score and legal status never reference each other — this is what makes
"severity/score must never override legal status" true by construction,
not by convention.
"""

from __future__ import annotations

from app.services.rules.types import RuleResult, RuleStatus

# Matches src/types/compliance.ts's complianceScoreBand() cutoffs exactly.
_EXCELLENT_MIN = 90
_GOOD_MIN = 70
_POOR_MIN = 40

# Only rules whose status can ever reach FAIL need an entry here — kept in
# sync with frontend_adapter.py's own _CATEGORY_MAP (used for the score
# breakdown; the frontend adapter uses the same table for checklist rows).
_CATEGORY_MAP: dict[str, str] = {
    "rule_6e_mrp": "mrp-non-compliance",
    "rule_6_2_consumer_care_completeness": "consumer-care-details-missing",
    "country_of_origin": "country-of-origin-missing",
    "rule_10_address": "other",
    "rules_11_13_quantity_unit": "other",
    "rule_7_font_size": "font-size-readability-failure",
}


def compute_legal_status(results: list[RuleResult]) -> str:
    """Exactly the task's own LEGAL STATUS rules:
    - Rule 3 not applicable -> "Not Applicable" (short-circuits everything else)
    - else any unresolved NEEDS_REVIEW/INSUFFICIENT_EVIDENCE among applicable
      rules -> "Needs Review"
    - else any applicable mandatory FAIL -> "Non-Compliant"
    - else -> "Compliant"
    """
    rule3 = next((r for r in results if r.rule_id == "rule_3_applicability"), None)
    if rule3 is not None and rule3.status == RuleStatus.NOT_APPLICABLE:
        return "Not Applicable"

    applicable = [r for r in results if r.status != RuleStatus.NOT_APPLICABLE]
    if any(r.status in (RuleStatus.NEEDS_REVIEW, RuleStatus.INSUFFICIENT_EVIDENCE) for r in applicable):
        return "Needs Review"
    if any(r.status == RuleStatus.FAIL for r in applicable):
        return "Non-Compliant"
    return "Compliant"


def compute_compliance_score(results: list[RuleResult]) -> dict:
    """Proportion of non-NOT_APPLICABLE rules that PASSed, rounded to the
    nearest integer 0-100. NEEDS_REVIEW/INSUFFICIENT_EVIDENCE/FAIL all
    count as "not passed" — an unresolved review item is legitimately less
    reassuring than a clean pass, even though it isn't yet a confirmed
    violation. Independent of compute_legal_status by construction: this
    function never inspects the Rule 3 short-circuit or any other
    status-only logic, only a plain pass ratio."""
    scored = [r for r in results if r.status != RuleStatus.NOT_APPLICABLE]
    if not scored:
        return {"value": 0, "band": "Critical", "breakdown_by_category": {}}

    passed = sum(1 for r in scored if r.status == RuleStatus.PASS)
    value = round((passed / len(scored)) * 100)
    if value >= _EXCELLENT_MIN:
        band = "Excellent"
    elif value >= _GOOD_MIN:
        band = "Good"
    elif value >= _POOR_MIN:
        band = "Poor"
    else:
        band = "Critical"

    breakdown: dict[str, int] = {}
    for r in scored:
        if r.status == RuleStatus.FAIL:
            category = _CATEGORY_MAP.get(r.rule_id, "other")
            breakdown[category] = breakdown.get(category, 0) + 1

    return {"value": value, "band": band, "breakdown_by_category": breakdown}
