"""
records/serialize.py — to_frontend_record(), the FULL frontend ComplianceRecord
shape (src/types/compliance.ts), used by the records list, the upgraded record
detail GET, the dashboard's recentScans, and the Company Profile -> Manufacturer
Scorecard adapter's products[].

api/v1/records.py's own _record_response() stays separate and unchanged — it's
the deliberately thin subset the Phase 4 Product DNA / Case Detail pages read,
returned by the mutation endpoints. to_frontend_record() is a strict superset
built for read-heavy list/detail/aggregate surfaces, added in Phase 5.

Several frontend fields have no backing column yet (evidence[], capturedImages[]
beyond a placeholder, ecommerceListingUrl, batchId, citizenReport, a real
thumbnail). These default to empty/None rather than being silently invented —
see Phase 5's own report for the documented gap list.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.db.models import ComplianceRecord, ProductInspectionLink, ViolationCase

# No real per-record evidence photo pipeline is joined back to a record yet
# (scans.py's evidence upload isn't indexed by compliance_record_id) — every
# record gets the same category-tinted placeholder scripts/generate-placeholders.mjs
# already produces for mock data, rather than a fabricated photo.
_CATEGORY_SLUGS = {
    "Packaged Food": "packaged-food",
    "Beverages": "beverages",
    "Personal Care": "personal-care",
    "Household Cleaning": "household-cleaning",
    "Pharmaceuticals": "pharmaceuticals",
    "Textiles and Garments": "textiles-and-garments",
    "Electronics and Appliances": "electronics-and-appliances",
    "Other": "other",
}


def _placeholder_image(record_id: str, category: str | None, product_name: str) -> dict:
    slug = _CATEGORY_SLUGS.get(category or "Other", "other")
    return {
        "id": f"{record_id}-thumbnail",
        "fileName": f"{slug}.svg",
        "url": f"/images/placeholder/{slug}.svg",
        "sizeBytes": 0,
        "angle": "front",
        "altText": f"No photo on file for {product_name} — placeholder image.",
    }


def _needs_review_flagged(checklist: list | None) -> bool:
    return any(not c["passed"] and "violationCategoryId" not in c for c in (checklist or []))


def _audit_trail(record: ComplianceRecord) -> list[dict]:
    trail: list[dict] = []
    if record.scanned_at:
        trail.append({
            "id": f"{record.id}-scanned",
            "type": "Scanned",
            "at": record.scanned_at.isoformat(),
        })
    if record.verified_at:
        trail.append({
            "id": f"{record.id}-verified",
            "type": "Verified",
            "at": record.verified_at.isoformat(),
            **({"byUserId": str(record.verified_by)} if record.verified_by else {}),
        })
    return trail


def to_frontend_record(record: ComplianceRecord, db: DbSession) -> dict:
    compliance_score = None
    if record.compliance_score is not None:
        compliance_score = {"value": record.compliance_score, "band": record.compliance_band}

    link = (
        db.query(ProductInspectionLink)
        .filter(ProductInspectionLink.compliance_record_id == record.id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .first()
    )
    active_case = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id == record.id)
        .filter(ViolationCase.status != "CLOSED")
        .first()
    )
    record_id = str(record.id)
    product_name = record.product_name_observed or "Unknown product"

    return {
        "id": record_id,
        "scanId": str(record.scan_session_id) if record.scan_session_id else record_id,
        "productName": product_name,
        "manufacturerName": record.manufacturer_name_observed or "Unknown manufacturer",
        "category": record.category,
        "region": record.region,
        "source": record.source,
        "verificationStatus": record.verification_status,
        "complianceStatus": record.compliance_status,
        "needsReviewFlag": _needs_review_flagged(record.checklist),
        "flaggedForEnforcement": active_case is not None,
        "productId": str(link.product_id) if link else None,
        "activeCaseId": str(active_case.id) if active_case else None,
        "enrichmentStatus": "linked" if link else ("pending" if record.verification_status == "Verified" else None),
        "checklist": record.checklist or [],
        "violations": record.violations or [],
        "complianceScore": compliance_score,
        "extraction": record.extraction,
        "evidence": [],
        "auditTrail": _audit_trail(record),
        "thumbnail": _placeholder_image(record_id, record.category, product_name),
        "capturedImages": [_placeholder_image(record_id, record.category, product_name)],
        "ecommerceListingUrl": None,
        "batchId": None,
        "citizenReport": None,
        "assignedOfficerUserId": str(record.assigned_officer_id) if record.assigned_officer_id else None,
        "scannedAt": record.scanned_at.isoformat() if record.scanned_at else None,
        "lastUpdatedAt": (record.verified_at or record.scanned_at or datetime.now(timezone.utc)).isoformat(),
        "archived": record.archived,
    }
