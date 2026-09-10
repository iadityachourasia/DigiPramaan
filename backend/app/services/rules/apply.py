"""
rules/apply.py — reapply_rules(), the shared "re-run the full rule engine
against a bundle and recompute the record's derived fields" logic. Extracted
from api/v1/records.py's correct_declaration() (Phase 3) so Phase 6's new
calibration endpoint (api/v1/scans.py) can reuse it exactly rather than
duplicating it — both are "something about the evidence changed pre-
verification, recompute everything from scratch" operations.

Deliberately returns the computed extraction_result rather than assigning it
to the record itself — correct_declaration() layers its own field-specific
tweaks (which declaration got marked `corrected`, product/manufacturer name
overwrite) on top; the calibration endpoint doesn't need any of that and
just takes the recomputed checklist/violations/status/score directly.
"""

from __future__ import annotations

from app.db.models import ComplianceRecord
from app.services.extraction.adapter import to_extraction_result
from app.services.extraction.schema import ComplianceEvidenceBundle
from app.services.measurement.font_height import FontMeasurementResult
from app.services.rules.aggregate import carry_forward_resolutions, compute_compliance_score, compute_legal_status
from app.services.rules.checks import run_all_rule_checks
from app.services.rules.frontend_adapter import to_checklist_and_violations
from app.services.rules.rule7_thresholds import get_required_height_mm
from app.services.rules.types import RuleStatus


def reapply_rules(
    record: ComplianceRecord,
    bundle: ComplianceEvidenceBundle,
    font_measurement: FontMeasurementResult | None = None,
    is_embossed: bool = False,
) -> dict:
    """Re-runs the ENTIRE rule engine against `bundle` (never just the rules
    that plausibly changed — these are pure, cheap functions), carries
    forward any officer resolutions unaffected by whatever changed, and
    returns everything a caller needs to update `record` and `bundle`:
    `{rule_results, legal_status, score_result, checklist, violations,
    extraction_result}`. Mutates `bundle.rule_results` in place (the bundle
    is the caller's own local object, about to be persisted as
    `record.evidence_bundle` either way) but does NOT write to `record`
    itself — the caller decides exactly which fields to assign."""
    previous_rule_results = bundle.rule_results

    rule_results = run_all_rule_checks(
        bundle.structured_extraction,
        category=record.category,
        image_quality_results=bundle.image_quality_results,
        total_ocr_blocks=len(bundle.ocr_blocks),
        font_measurement=font_measurement,
        is_embossed=is_embossed,
    )
    rule_results = carry_forward_resolutions(rule_results, previous_rule_results)
    bundle.rule_results = rule_results

    legal_status = compute_legal_status(rule_results)
    score_result = compute_compliance_score(rule_results)
    checklist, violations = to_checklist_and_violations(rule_results)
    if legal_status == "Not Applicable":
        violations = []

    extraction_result = to_extraction_result(str(record.scan_session_id), bundle.structured_extraction)

    # Phase 6: populate the frontend's existing (previously always-empty)
    # fontSizeChecks contract from the real measurement, when one was made.
    # PASS/FAIL only ever appears here once a threshold is legally
    # validated (rule7_thresholds.py) — until then this still reports the
    # measured number even though the rule's own checklist status is
    # NEEDS_REVIEW, so an officer can see the raw measurement regardless.
    font_size_checks: list[dict] = []
    rule7_result = next((r for r in rule_results if r.rule_id == "rule_7_font_size"), None)
    if (
        rule7_result is not None
        and font_measurement is not None
        and font_measurement.measured_height_mm is not None
    ):
        field_id = font_measurement.evidence.get("field_id")
        if field_id:
            font_size_checks.append({
                "fieldId": field_id,
                "measuredHeightMm": round(font_measurement.measured_height_mm, 2),
                "requiredHeightMm": get_required_height_mm(is_embossed),
                "embossed": is_embossed,
                "passed": rule7_result.effective_status == RuleStatus.PASS,
            })
    extraction_result["fontSizeChecks"] = font_size_checks

    return {
        "rule_results": rule_results,
        "legal_status": legal_status,
        "score_result": score_result,
        "checklist": checklist,
        "violations": violations,
        "extraction_result": extraction_result,
    }
