"""
api/v1/records.py — POST /records/{id}/corrections, POST /records/{id}/verify,
POST /records/{id}/resolutions.

All three enforce the immutability rule stated in
db/models/compliance_record.py's own docstring: before verification,
corrections/resolutions may update extraction/checklist/violations and
re-run rules freely; once Verified, further writes to those columns are
refused (409), and a later correction/reinspection must create a NEW
ComplianceRecord via a new ScanSession — already guaranteed by Phase 2's
derive_record_id() being a pure hash of scan_session_id, so no code here
needs to enforce that part.

Officer identity comes from the authenticated Profile
(Depends(get_current_user)/require_permission), never a client-supplied
userId field — a deliberate improvement over the old frontend mock's
convention of trusting a body field for who made a change.

Phase 3.1 adds POST /records/{id}/resolutions: some rule results are
legitimately unresolvable by automation (Rule 7 always; Rule 8/9
sometimes) — this lets an officer resolve a NEEDS_REVIEW/
INSUFFICIENT_EVIDENCE RuleResult to a final PASS/FAIL without ever
overwriting the original automated verdict (see rules/types.py's
RuleResult.resolution / effective_status).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.api.deps.permissions import require_permission
from app.db.models import ComplianceRecord, Profile
from app.db.session import get_db
from app.services.extraction.adapter import to_extraction_result
from app.services.extraction.schema import ComplianceEvidenceBundle, ExtractedField
from app.services.rules.aggregate import (
    carry_forward_resolutions,
    compute_compliance_score,
    compute_legal_status,
)
from app.services.rules.checks import run_all_rule_checks
from app.services.rules.frontend_adapter import to_checklist_and_violations
from app.services.rules.types import RuleResolution, RuleStatus

router = APIRouter(tags=["records"], prefix="/records")

# The 7 existing DeclarationFieldIds a correction may target, mapped to the
# StructuredExtraction attribute that actually backs them. `manufacturerDetails`
# is the one deliberate simplification: it writes through to the primary
# `manufacturer` field only, never packer/importer/brand_owner_or_marketer —
# an officer cannot use this endpoint to reassign WHICH of the 4 legal roles
# a name belongs to, only to correct the manufacturer's own name/value. A
# richer correction UI naming the specific role is out of Phase 3 scope.
_FRONTEND_TO_INTERNAL_FIELD = {
    "manufacturerDetails": "manufacturer",
    "genericName": "generic_name",
    "netQuantity": "net_quantity",
    "manufactureDate": "manufacture_or_import_date",
    "retailSalePrice": "mrp",
    "countryOfOrigin": "country_of_origin",
    "consumerCareDetails": "consumer_care",
}


class CorrectionRequest(BaseModel):
    field_id: str
    value: str


class ResolutionRequest(BaseModel):
    rule_id: str
    resolved_status: str  # "PASS" or "FAIL" only — validated below
    note: str


def _record_response(record: ComplianceRecord) -> dict:
    """The subset of the frontend's ComplianceRecord shape this backend
    actually owns and computes. Deliberately NOT the full frontend
    ComplianceRecord (evidence[], auditTrail[], thumbnail, capturedImages,
    needsReviewFlag, flaggedForEnforcement, etc.) — those depend on data
    Phase 3 doesn't touch (EvidenceImage aggregation, an audit_event table,
    needs-review/enforcement-flagging endpoints). A dedicated GET
    /records/{id} assembling the full shape is a reasonable later addition,
    not this one."""
    compliance_score = None
    if record.compliance_score is not None:
        compliance_score = {"value": record.compliance_score, "band": record.compliance_band}
    return {
        "id": str(record.id),
        "scanId": str(record.scan_session_id) if record.scan_session_id else None,
        "productName": record.product_name_observed,
        "manufacturerName": record.manufacturer_name_observed,
        "category": record.category,
        "region": record.region,
        "source": record.source,
        "verificationStatus": record.verification_status,
        "complianceStatus": record.compliance_status,
        "complianceScore": compliance_score,
        "extraction": record.extraction,
        "checklist": record.checklist,
        "violations": record.violations,
        "scannedAt": record.scanned_at.isoformat() if record.scanned_at else None,
        "lastUpdatedAt": (record.verified_at or record.scanned_at or datetime.now(timezone.utc)).isoformat(),
    }


@router.post("/{record_id}/corrections")
def correct_declaration(
    record_id: uuid.UUID,
    body: CorrectionRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    record = db.get(ComplianceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compliance record not found")
    if record.verification_status == "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is Verified — corrections require a new inspection",
        )
    if body.field_id not in _FRONTEND_TO_INTERNAL_FIELD:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown or uncorrectable fieldId: {body.field_id}",
        )
    if record.evidence_bundle is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No evidence bundle available for this record yet",
        )

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    previous_rule_results = bundle.rule_results
    internal_attr = _FRONTEND_TO_INTERNAL_FIELD[body.field_id]
    current_field: ExtractedField | None = getattr(bundle.structured_extraction, internal_attr)
    updated_field = ExtractedField(
        value=body.value,
        not_detected=False,
        evidence=current_field.evidence if current_field else [],
        extraction_confidence=current_field.extraction_confidence if current_field else 0.0,
        corrected=True,
        corrected_by=str(current_user.id),
    )
    setattr(bundle.structured_extraction, internal_attr, updated_field)

    # Re-run the ENTIRE rule engine rather than computing which rules are
    # "affected" by one field — these are pure, cheap functions, and
    # re-running all of them is simpler and safer than partial invalidation.
    # Reuses the SAME image-quality/OCR-block-count evidence already
    # persisted in the bundle (no re-OCR) so the mandatory-missing
    # adequate-evidence judgment (checks.py's CORE PRINCIPLE) stays
    # consistent with what the pipeline originally saw.
    rule_results = run_all_rule_checks(
        bundle.structured_extraction, category=record.category,
        image_quality_results=bundle.image_quality_results, total_ocr_blocks=len(bundle.ocr_blocks),
    )
    # A correction to one field must never silently discard an officer's
    # earlier resolution on an unrelated, still-ambiguous rule.
    rule_results = carry_forward_resolutions(rule_results, previous_rule_results)
    bundle.rule_results = rule_results
    legal_status = compute_legal_status(rule_results)
    score_result = compute_compliance_score(rule_results)
    checklist, violations = to_checklist_and_violations(rule_results)
    if legal_status == "Not Applicable":
        violations = []

    extraction_result = to_extraction_result(str(record.scan_session_id), bundle.structured_extraction)
    for decl in extraction_result["declarations"]:
        if decl["fieldId"] == body.field_id:
            decl["corrected"] = True
            decl["correctedByUserId"] = str(current_user.id)

    record.evidence_bundle = bundle.model_dump()
    record.extraction = extraction_result
    record.checklist = checklist
    record.violations = violations
    record.compliance_status = legal_status
    record.compliance_score = score_result["value"]
    record.compliance_band = score_result["band"]
    record.product_name_observed = extraction_result["declarations"][1]["value"]
    record.manufacturer_name_observed = extraction_result["declarations"][0]["value"]
    db.commit()
    db.refresh(record)

    return _record_response(record)


@router.post("/{record_id}/verify")
def verify_record(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    record = db.get(ComplianceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compliance record not found")
    if record.verification_status == "Verified":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Record is already Verified")

    # Phase 3.1: block verification on UNRESOLVED review/evidence issues
    # only — a checklist row with `passed: false` and no `violationCategoryId`
    # is exactly a still-open NEEDS_REVIEW/INSUFFICIENT_EVIDENCE item (see
    # frontend_adapter.py's mapping). A row with `passed: false` AND a
    # `violationCategoryId` is a CONFIRMED failure (automated or
    # officer-resolved) — that's a legitimate, verifiable NON_COMPLIANT
    # finding, not something blocking verification; the whole point of this
    # system is to let an officer verify "yes, this is genuinely
    # non-compliant." This also naturally never blocks on NOT_APPLICABLE
    # rules (e.g. a domestic product's countryOfOrigin), since those never
    # appear in the checklist at all.
    blocked_fields = [
        c["fieldId"] for c in (record.checklist or [])
        if not c["passed"] and "violationCategoryId" not in c
    ]
    if blocked_fields:
        # A record with an unresolved review item is not an error, just not
        # verifiable yet — 200 with the blocking field list, no mutation.
        # Resolve it via POST /records/{id}/resolutions, or correct the
        # underlying field, then verify again.
        return {"record": _record_response(record), "blockedFields": blocked_fields}

    record.verification_status = "Verified"
    record.verified_by = current_user.id
    record.verified_at = datetime.now(timezone.utc)
    # extraction/checklist/violations/compliance_status/compliance_score/
    # compliance_band already reflect the current real state (computed by
    # the pipeline and kept current by every correction) — no
    # recomputation on verify, just the freeze.
    db.commit()
    db.refresh(record)

    return {"record": _record_response(record), "blockedFields": []}


@router.post("/{record_id}/resolutions")
def resolve_review_item(
    record_id: uuid.UUID,
    body: ResolutionRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    """Officer resolution for a rule the automated engine legitimately
    could not decide (Rule 7 always; Rule 8/9 sometimes) — resolves it to
    a final PASS or FAIL WITHOUT overwriting the original automated
    RuleResult.status. Only rules currently NEEDS_REVIEW/
    INSUFFICIENT_EVIDENCE (by their own unresolved `status`, not
    `effective_status` — re-resolving an already-resolved item is allowed,
    the officer may change their mind) can be targeted."""
    record = db.get(ComplianceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compliance record not found")
    if record.verification_status == "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is Verified — resolutions require a new inspection",
        )
    if record.evidence_bundle is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No evidence bundle available for this record yet",
        )
    if body.resolved_status not in ("PASS", "FAIL"):
        raise HTTPException(
            status_code=422,
            detail="resolved_status must be exactly 'PASS' or 'FAIL'",
        )

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    rule_result = next((r for r in bundle.rule_results if r.rule_id == body.rule_id), None)
    if rule_result is None:
        raise HTTPException(status_code=404, detail=f"Unknown rule_id: {body.rule_id}")
    if rule_result.status not in (RuleStatus.NEEDS_REVIEW, RuleStatus.INSUFFICIENT_EVIDENCE):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Rule '{body.rule_id}' is automated status {rule_result.status.value} — only "
                "NEEDS_REVIEW/INSUFFICIENT_EVIDENCE rules can be officer-resolved"
            ),
        )

    rule_result.resolution = RuleResolution(
        resolved_status=RuleStatus(body.resolved_status),
        resolved_by=str(current_user.id),
        resolved_at=datetime.now(timezone.utc).isoformat(),
        note=body.note,
    )

    legal_status = compute_legal_status(bundle.rule_results)
    score_result = compute_compliance_score(bundle.rule_results)
    checklist, violations = to_checklist_and_violations(bundle.rule_results)
    if legal_status == "Not Applicable":
        violations = []

    record.evidence_bundle = bundle.model_dump()
    record.checklist = checklist
    record.violations = violations
    record.compliance_status = legal_status
    record.compliance_score = score_result["value"]
    record.compliance_band = score_result["band"]
    db.commit()
    db.refresh(record)

    return _record_response(record)
