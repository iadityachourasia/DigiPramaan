"""
api/v1/records.py — POST /records/{id}/corrections, POST /records/{id}/verify.

Both endpoints enforce the immutability rule stated in
db/models/compliance_record.py's own docstring: before verification,
corrections may update extraction/checklist/violations and re-run rules
freely; once Verified, further writes to those columns are refused (409),
and a later correction/reinspection must create a NEW ComplianceRecord via
a new ScanSession — already guaranteed by Phase 2's derive_record_id()
being a pure hash of scan_session_id, so no code here needs to enforce
that part.

Officer identity comes from the authenticated Profile
(Depends(get_current_user)/require_permission), never a client-supplied
userId field — a deliberate improvement over the old frontend mock's
convention of trusting a body field for who made a change.
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
from app.services.rules.aggregate import compute_compliance_score, compute_legal_status
from app.services.rules.checks import run_all_rule_checks
from app.services.rules.frontend_adapter import to_checklist_and_violations

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
    rule_results = run_all_rule_checks(bundle.structured_extraction, category=record.category)
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

    # A notDetected declaration only blocks verification if the rule engine
    # actually considers it relevant — i.e. it appears in the checklist.
    # NOT_APPLICABLE rule results (e.g. countryOfOrigin with no import
    # evidence) are deliberately excluded from the checklist entirely (see
    # frontend_adapter.py), so a domestic product's permanently-not-detected
    # countryOfOrigin must never block verification — the mock's original
    # blunt "any notDetected blocks" rule would otherwise make every
    # domestic-product scan permanently unverifiable, which is a real bug,
    # not fidelity to the existing contract worth preserving.
    declarations = (record.extraction or {}).get("declarations", [])
    checklist_field_ids = {c["fieldId"] for c in (record.checklist or [])}
    blocked_fields = [
        d["fieldId"] for d in declarations
        if d.get("notDetected") and d["fieldId"] in checklist_field_ids
    ]
    if blocked_fields:
        # Matches the one real existing mock contract exactly: a record
        # with any not-yet-detected declaration is not an error, just not
        # verifiable yet — 200 with the blocking field list, no mutation.
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
