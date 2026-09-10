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

from app.db.models import ComplianceRecord, Profile


def build_report_document(record: ComplianceRecord, current_user: Profile, base_url: str) -> dict:
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
