"""
rules/frontend_adapter.py — list[RuleResult] -> the EXISTING frontend's
DeclarationCheck[]/Violation[] contract (src/types/compliance.ts).

A separate module from extraction/adapter.py on purpose: that module
converts StructuredExtraction -> ExtractionResult (the extraction-only
contract, a different input type feeding a different UI panel); this one
converts list[RuleResult] -> (checklist, violations) (the compliance-only
contract). Keeping them separate mirrors the existing extraction/ vs. a new
rules/ package split.

Mapping, exactly:
- NOT_APPLICABLE -> excluded from the checklist entirely (nothing to show)
- rule3Applicability -> ALSO always excluded, any status: Rule 3's PASS
  means "applies normally, not exempt", which would read like a compliance
  pass to an officer. It only feeds compute_legal_status's short-circuit.
- PASS -> checklist row {fieldId, passed: true, value}
- FAIL -> checklist row with passed:false + violationCategoryId + detail,
  AND appended to violations[] (a confirmed non-compliance)
- NEEDS_REVIEW / INSUFFICIENT_EVIDENCE -> checklist row with passed:false
  + detail, but NO violationCategoryId and NOT added to violations[] —
  violations[] represents CONFIRMED non-compliance only, never an
  unresolved OCR-absence.

DeclarationCheck.fieldId is a plain `string` in the frontend type (not
constrained to the 7 DeclarationFieldId values) — so new fieldIds like
"addressCompleteness" are safe to emit with zero frontend type change.
Violation.categoryId IS a closed union (ViolationCategoryId) — every
categoryId emitted here must be one of the 10 existing values; "other" is
the catch-all for rules with no dedicated category (Rule 10, Rules 11-13).
"""

from __future__ import annotations

from app.services.rules.types import RuleResult, RuleStatus

# Mirrors src/types/vocabulary.ts's VIOLATION_TAXONOMY exactly — kept in
# sync by hand, same discipline as deps/permissions.py's ROLE_PERMISSIONS.
_VIOLATION_TAXONOMY: dict[str, dict[str, str]] = {
    "manufacturer-details-missing": {"category": "Manufacturer/Packer/Importer Details Missing"},
    "generic-name-missing-or-incorrect": {"category": "Generic Name Missing or Incorrect"},
    "net-quantity-missing-or-incorrect": {"category": "Net Quantity Missing or Incorrect"},
    "manufacture-import-date-missing": {"category": "Manufacture/Import Date Missing"},
    "mrp-non-compliance": {"category": "MRP Non-Compliance"},
    "country-of-origin-missing": {"category": "Country of Origin Missing"},
    "consumer-care-details-missing": {"category": "Consumer Care Details Missing"},
    "font-size-readability-failure": {"category": "Font Size / Readability Failure"},
    "non-standard-or-misleading-format": {"category": "Non-Standard or Misleading Format"},
    "other": {"category": "Other"},
}

# Only rules whose status can actually reach FAIL need an entry — kept in
# sync with aggregate.py's own copy (used there for the score breakdown).
_CATEGORY_MAP: dict[str, str] = {
    "rule_6a_manufacturer": "manufacturer-details-missing",
    "rule_6b_generic_name": "generic-name-missing-or-incorrect",
    "rule_6c_net_quantity": "net-quantity-missing-or-incorrect",
    "rule_6d_manufacture_date": "manufacture-import-date-missing",
    "rule_6e_mrp": "mrp-non-compliance",
    "rule_6_2_consumer_care_completeness": "consumer-care-details-missing",
    "country_of_origin": "country-of-origin-missing",
    "rule_10_address": "other",
    "rules_11_13_quantity_unit": "other",
    "rule_7_font_size": "font-size-readability-failure",
}

_EXCLUDED_FIELD_IDS = {"rule3Applicability"}
_CONSUMER_CARE_FIELD_ID = "consumerCareDetails"
_CONSUMER_CARE_RULE_IDS = {"rule_6_consumer_care", "rule_6_2_consumer_care_completeness"}

_STATUS_RANK = {
    RuleStatus.FAIL: 3,
    RuleStatus.NEEDS_REVIEW: 2,
    RuleStatus.INSUFFICIENT_EVIDENCE: 2,
    RuleStatus.PASS: 1,
    RuleStatus.NOT_APPLICABLE: 0,
}


def _merge_consumer_care(results: list[RuleResult]) -> list[RuleResult]:
    """Rule 6 (presence) and Rule 6(2) (completeness) both target
    consumerCareDetails — collapse them into one RuleResult before the main
    loop so exactly one checklist row is emitted. FAIL wins over
    NEEDS_REVIEW/INSUFFICIENT_EVIDENCE wins over PASS; prefer the 6(2)
    message when it's the one that fired, since "present but incomplete"
    is more actionable than a bare "not detected"."""
    consumer_care_results = [r for r in results if r.rule_id in _CONSUMER_CARE_RULE_IDS]
    if not consumer_care_results:
        return results

    merged = max(consumer_care_results, key=lambda r: _STATUS_RANK[r.status])
    other_results = [r for r in results if r.rule_id not in _CONSUMER_CARE_RULE_IDS]
    return other_results + [merged]


def _value_for(result: RuleResult) -> str | None:
    return result.value


def to_checklist_and_violations(results: list[RuleResult]) -> tuple[list[dict], list[dict]]:
    results = _merge_consumer_care(results)
    checklist: list[dict] = []
    violations: list[dict] = []

    for r in results:
        if r.status == RuleStatus.NOT_APPLICABLE or r.field_id in _EXCLUDED_FIELD_IDS:
            continue

        if r.status == RuleStatus.PASS:
            checklist.append({"fieldId": r.field_id, "passed": True, "value": _value_for(r)})
        elif r.status == RuleStatus.FAIL:
            category_id = _CATEGORY_MAP.get(r.rule_id, "other")
            checklist.append({
                "fieldId": r.field_id, "passed": False, "value": _value_for(r),
                "violationCategoryId": category_id, "detail": r.message,
            })
            violations.append({
                "categoryId": category_id,
                "category": _VIOLATION_TAXONOMY[category_id]["category"],
                "legalBasis": r.legal_basis,
                "detail": r.message,
            })
        else:  # NEEDS_REVIEW or INSUFFICIENT_EVIDENCE
            checklist.append({
                "fieldId": r.field_id, "passed": False, "value": _value_for(r),
                "detail": r.message,
            })

    return checklist, violations
