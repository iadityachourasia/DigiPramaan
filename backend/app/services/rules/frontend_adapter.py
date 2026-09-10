"""
rules/frontend_adapter.py — list[RuleResult] -> the EXISTING frontend's
DeclarationCheck[]/Violation[] contract (src/types/compliance.ts).

A separate module from extraction/adapter.py on purpose: that module
converts StructuredExtraction -> ExtractionResult (the extraction-only
contract, a different input type feeding a different UI panel); this one
converts list[RuleResult] -> (checklist, violations) (the compliance-only
contract). Keeping them separate mirrors the existing extraction/ vs. a new
rules/ package split.

Mapping, exactly (all branches keyed on `effective_status` — an officer's
resolution, when one exists, wins over the original automated `status`;
see rules/types.py's RuleResult.effective_status):
- NOT_APPLICABLE -> excluded from the checklist entirely (nothing to show)
- rule3Applicability -> ALSO always excluded, any status: Rule 3's PASS
  means "applies normally, not exempt", which would read like a compliance
  pass to an officer. It only feeds compute_legal_status's short-circuit.
- PASS -> checklist row {fieldId, passed: true, value}
- FAIL -> checklist row with passed:false + violationCategoryId + detail,
  AND appended to violations[] (a confirmed non-compliance) — this
  includes an officer-resolved FAIL, which is exactly as confirmed as an
  automated one once a reviewer has made the call.
- NEEDS_REVIEW / INSUFFICIENT_EVIDENCE (still unresolved) -> checklist row
  with passed:false + detail, but NO violationCategoryId and NOT added to
  violations[] — violations[] represents CONFIRMED non-compliance only,
  never an unresolved OCR-absence.

Whenever a RuleResult carries a resolution, its officer's note is appended
to the checklist row's `detail` string so the UI shows both the original
automated read and the human judgment call on top of it — the automated
`message` is never replaced, only annotated.

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


def violation_category_label(category_id: str) -> str:
    """Public accessor for _VIOLATION_TAXONOMY's human label — used outside
    this module by risk/engine.py (R1/R2's reason strings need to name the
    actual violated category), so Smart Risk never re-declares its own
    copy of the taxonomy."""
    entry = _VIOLATION_TAXONOMY.get(category_id)
    return entry["category"] if entry else category_id

# Every rule whose status can actually reach FAIL needs an entry — kept in
# sync with aggregate.py's own copy (used there for the score breakdown).
# Since Phase 3.1, that's every Rule 6(a)-(d)/consumer-care presence check
# too (a genuinely-absent-with-adequate-evidence field is now FAIL, not
# just NEEDS_REVIEW), not only the format/completeness sub-checks.
_CATEGORY_MAP: dict[str, str] = {
    "rule_6a_manufacturer": "manufacturer-details-missing",
    "rule_6b_generic_name": "generic-name-missing-or-incorrect",
    "rule_6c_net_quantity": "net-quantity-missing-or-incorrect",
    "rule_6d_manufacture_date": "manufacture-import-date-missing",
    "rule_6e_mrp": "mrp-non-compliance",
    "rule_6_consumer_care": "consumer-care-details-missing",
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

    merged = max(consumer_care_results, key=lambda r: _STATUS_RANK[r.effective_status])
    other_results = [r for r in results if r.rule_id not in _CONSUMER_CARE_RULE_IDS]
    return other_results + [merged]


def _value_for(result: RuleResult) -> str | None:
    return result.value


def _detail_for(result: RuleResult) -> str:
    if result.resolution is None:
        return result.message
    return (
        f"{result.message} [Officer-resolved {result.resolution.resolved_status.value}: "
        f"{result.resolution.note}]"
    )


def to_checklist_and_violations(results: list[RuleResult]) -> tuple[list[dict], list[dict]]:
    results = _merge_consumer_care(results)
    checklist: list[dict] = []
    violations: list[dict] = []

    for r in results:
        eff = r.effective_status
        if eff == RuleStatus.NOT_APPLICABLE or r.field_id in _EXCLUDED_FIELD_IDS:
            continue

        if eff == RuleStatus.PASS:
            row = {"fieldId": r.field_id, "passed": True, "value": _value_for(r), "ruleId": r.rule_id}
            if r.resolution is not None:
                row["detail"] = _detail_for(r)
            checklist.append(row)
        elif eff == RuleStatus.FAIL:
            category_id = _CATEGORY_MAP.get(r.rule_id, "other")
            detail = _detail_for(r)
            checklist.append({
                "fieldId": r.field_id, "passed": False, "value": _value_for(r),
                "violationCategoryId": category_id, "detail": detail, "ruleId": r.rule_id,
            })
            violations.append({
                "categoryId": category_id,
                "category": _VIOLATION_TAXONOMY[category_id]["category"],
                "legalBasis": r.legal_basis,
                "detail": detail,
                # Additive, backend-internal only — not part of the frontend's
                # exported Violation type, but lets Phase 6's report snapshot
                # (services/reports/snapshot.py) look up a cached
                # RuleExplanation for this specific violation without a
                # fragile message/category match.
                "ruleId": r.rule_id,
            })
        else:  # NEEDS_REVIEW or INSUFFICIENT_EVIDENCE, still unresolved
            checklist.append({
                "fieldId": r.field_id, "passed": False, "value": _value_for(r),
                "detail": r.message, "ruleId": r.rule_id,
            })

    return checklist, violations
