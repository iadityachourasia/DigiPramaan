"""
reports/snapshot.py — build_report_document(), the frozen ReportDocument
(src/types/report.ts) built directly from real DB data at generation time.

Deliberately skips the frontend's own buildReportDocument()/verifierOf()
(src/lib/server/report-render.ts) — those resolve attribution through
@/lib/mock/users, which has no meaning for a real Verified record. This
backend already knows exactly who verified the record (verified_by) and who
is generating the report (current_user), so attribution is built directly
from real Profile rows instead.

MVP scope, matching the Report DB model's own docstring: single-record
reports only. `records`/`totalRecords`/`truncated` are always a 1-item list.

Phase 7 adds `declarations` (the full checklist), `inspectionMetadata`, and
`evidenceImages` to the record section — the last being REFERENCES only
(`{angle, imageId}`), not embedded photo bytes. See
`_evidence_image_references()`'s own docstring for why: embedding real
photos would need the Node subprocess renderer to receive and lay out
image bytes, which it has no capability for today — a materially larger
change than this phase's scope. The immutable generate-once/never-
regenerate architecture itself is completely unchanged.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.db.models import ComplianceRecord, EvidenceImage, Profile, RuleExplanation


def _explanation_for(v: dict, db: DbSession, record_id: uuid.UUID) -> str:
    """A cached Gemini explanation's summary if one exists for this
    violation's originating rule; otherwise the deterministic rule-engine
    reason (`detail`, already the rule's own message — see
    frontend_adapter.py's to_checklist_and_violations) as fallback. A
    report violation is NEVER left with no explanation at all."""
    rule_id = v.get("ruleId")
    if rule_id:
        cached = (
            db.query(RuleExplanation)
            .filter(RuleExplanation.compliance_record_id == record_id, RuleExplanation.rule_id == rule_id)
            .first()
        )
        if cached is not None:
            return cached.explanation.get("summary", v.get("detail", ""))
    return v.get("detail", "")


def build_report_document(record: ComplianceRecord, current_user: Profile, base_url: str, db: DbSession) -> dict:
    reference_code = str(uuid.uuid4())
    generated_at = datetime.now(timezone.utc).isoformat()
    product_name = record.product_name_observed or "Unknown product"
    manufacturer_name = record.manufacturer_name_observed or "Unknown manufacturer"
    scope_description = f"{product_name} — {manufacturer_name}"

    attribution = {
        "kind": "verifier",
        "name": current_user.full_name,
        "role": current_user.role,
        "region": current_user.region or "—",
        "verifiedAt": record.verified_at.isoformat() if record.verified_at else None,
    }

    section = {
        "recordId": str(record.id),
        "scanId": str(record.scan_session_id) if record.scan_session_id else str(record.id),
        "productName": product_name,
        "manufacturerName": manufacturer_name,
        "category": record.category,
        "region": record.region,
        "complianceStatus": record.compliance_status,
        **({"complianceScore": record.compliance_score} if record.compliance_score is not None else {}),
        "verifier": {
            "name": current_user.full_name,
            "role": current_user.role,
            "verifiedAt": record.verified_at.isoformat() if record.verified_at else None,
        },
        "violations": [
            {
                "category": v.get("category"),
                "legalBasis": v.get("legalBasis"),
                **({"detail": v["detail"]} if v.get("detail") else {}),
                # Phase 6: cached Gemini explanation summary if one exists,
                # else the deterministic rule-engine reason — see
                # _explanation_for()'s own docstring.
                "explanation": _explanation_for(v, db, record.id),
                # Phase 7: the originating rule's own structured evidence
                # (Rule 7 measurement, Rule 8 placement, Rule 9 readability),
                # when the rule populated one.
                **({"evidence": v["evidence"]} if v.get("evidence") else {}),
            }
            for v in (record.violations or [])
        ],
        # Phase 7: the full declaration checklist (not just violations) —
        # "declaration results" per every mandatory field, each row already
        # carrying its own evidence dict where the rule engine produced one.
        "declarations": record.checklist or [],
        "inspectionMetadata": {
            "verificationStatus": record.verification_status,
            "source": record.source,
            "scannedAt": record.scanned_at.isoformat() if record.scanned_at else None,
            "verifiedAt": record.verified_at.isoformat() if record.verified_at else None,
        },
        # Phase 7: evidence photograph REFERENCES only — see this module's
        # own docstring update below on why actual photos aren't embedded
        # this phase.
        "evidenceImages": _evidence_image_references(record, db),
    }

    return {
        "title": "Legal Metrology Compliance Report",
        "scopeDescription": scope_description,
        "generatedAt": generated_at,
        "referenceCode": reference_code,
        "verifyUrl": f"{base_url.rstrip('/')}/en/reports?reference={reference_code}",
        "attribution": attribution,
        "records": [section],
        "totalRecords": 1,
        "truncated": False,
    }


def _evidence_image_references(record: ComplianceRecord, db: DbSession) -> list[dict]:
    """References only (angle + imageId) — NOT the actual photo bytes.
    report-render.ts has zero existing image-embedding capability (the
    Node subprocess bridge only ever receives this JSON snapshot, never
    image bytes), and adding real PDF/DOCX photo layout is a materially
    larger, riskier change than embedding a reference. A future phase can
    add real embedding without re-architecting anything here — the
    reference already carries everything needed (imageId resolves via the
    real GET /evidence-images/{id} endpoint)."""
    if record.scan_session_id is None:
        return []
    images = (
        db.query(EvidenceImage)
        .filter(EvidenceImage.scan_session_id == record.scan_session_id)
        .order_by(EvidenceImage.uploaded_at)
        .all()
    )
    return [{"angle": image.angle, "imageId": str(image.id)} for image in images]
