"""
api/v1/explanations.py — POST /records/{record_id}/violations/{rule_id}/explain.

Resolves the rule's ALREADY-DECIDED result from evidence_bundle.rule_results,
hashes the authoritative facts, and either serves a cached RuleExplanation
row (zero Gemini calls) or generates + persists a new one. Post-
verification, evidence_bundle never changes again, so input_hash is
permanently stable — that's what keeps a verified record's explanation from
silently changing later, with no extra code beyond the hash comparison
below. This file has no import of anything that writes compliance_status/
checklist/violations/compliance_score/resolution — see
services/explanation/gemini_explainer.py's own docstring on why that's the
architectural half of the Gemini boundary, not just prompt wording.
"""

from __future__ import annotations

import hashlib
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.models import ComplianceRecord, Profile, RuleExplanation
from app.db.session import get_db
from app.services.explanation.gemini_explainer import (
    ExplanationRequest,
    GeminiExplanationError,
    ImageMetadata,
    OfficerResolution,
    explain_violation,
)
from app.services.extraction.schema import ComplianceEvidenceBundle
from app.services.rules.types import RuleResult

router = APIRouter(tags=["explanations"], prefix="/records")


def _compute_input_hash(rule_result: RuleResult) -> str:
    payload = {
        "rule_id": rule_result.rule_id,
        "status": rule_result.effective_status.value,
        "message": rule_result.message,
        "value": rule_result.value,
        "resolution": rule_result.resolution.model_dump() if rule_result.resolution else None,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _find_evidence_ref_metadata(bundle: ComplianceEvidenceBundle, rule_id: str) -> ImageMetadata | None:
    """Best-effort: rule_7's evidence is keyed by the calibrated field, not
    a fixed StructuredExtraction attribute — for every other rule this
    looks up nothing and the explanation simply has no image metadata,
    which is fine (it's supplementary context, not load-bearing)."""
    if rule_id != "rule_7_font_size":
        return None
    for calibration in bundle.calibrations:
        if not calibration.superseded:
            return ImageMetadata(image_id=calibration.image_id)
    return None


@router.post("/{record_id}/violations/{rule_id}/explain")
def explain_rule_violation(
    record_id: uuid.UUID,
    rule_id: str,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    record = db.get(ComplianceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compliance record not found")
    if record.evidence_bundle is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No evidence bundle available yet")

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    rule_result = next((r for r in bundle.rule_results if r.rule_id == rule_id), None)
    if rule_result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown rule_id: {rule_id}")

    input_hash = _compute_input_hash(rule_result)

    existing = (
        db.query(RuleExplanation)
        .filter(RuleExplanation.compliance_record_id == record_id, RuleExplanation.rule_id == rule_id)
        .first()
    )
    if existing is not None and existing.input_hash == input_hash:
        return {"explanation": existing.explanation, "cached": True, "generatedAt": existing.generated_at.isoformat()}

    officer_resolution = None
    if rule_result.resolution is not None:
        officer_resolution = OfficerResolution(
            resolved_status=rule_result.resolution.resolved_status.value,
            resolved_by=rule_result.resolution.resolved_by,
            note=rule_result.resolution.note,
        )

    request = ExplanationRequest(
        rule_id=rule_result.rule_id,
        rule_name=rule_result.rule_name,
        rule_status=rule_result.effective_status.value,
        legal_basis=rule_result.legal_basis,
        message=rule_result.message,
        evidence={"value": rule_result.value} if rule_result.value else {},
        expected_requirement=rule_result.value if rule_id == "rule_7_font_size" else None,
        image_metadata=_find_evidence_ref_metadata(bundle, rule_id),
        officer_resolution=officer_resolution,
    )

    try:
        output = explain_violation(request, settings)
    except GeminiExplanationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    explanation_dict = output.model_dump()
    if existing is not None:
        existing.input_hash = input_hash
        existing.explanation = explanation_dict
        existing.model_name = settings.gemini_model
    else:
        existing = RuleExplanation(
            compliance_record_id=record_id, rule_id=rule_id, input_hash=input_hash,
            explanation=explanation_dict, model_name=settings.gemini_model,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)

    return {"explanation": explanation_dict, "cached": False, "generatedAt": existing.generated_at.isoformat()}
