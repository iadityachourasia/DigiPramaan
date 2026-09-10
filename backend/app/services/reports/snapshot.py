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
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.db.models import ComplianceRecord, Profile, RuleExplanation


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
            }
            for v in (record.violations or [])
        ],
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
