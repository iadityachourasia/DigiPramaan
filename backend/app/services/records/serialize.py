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

from app.db.models import (
    AuditEvent,
    ComplianceRecord,
    EvidenceImage,
    Profile,
    ProductInspectionLink,
    RecordReviewFlag,
    ViolationCase,
)
from app.services.audit import ACTIVITY_TO_AUDIT_TYPE

_ANGLE_ALT_TEXT = {
    "front": "Front label photograph",
    "back": "Back label photograph",
    "side_pdp": "Side — Principal Display Panel photograph",
}

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


def _real_captured_images(record: ComplianceRecord, db: DbSession, product_name: str) -> list[dict]:
    """Phase 7 — real evidence photographs, replacing the placeholder. Bare
    API-relative path (`/evidence-images/{id}`), NOT a full authenticated
    URL — the frontend appends NEXT_PUBLIC_API_BASE_URL + the session's own
    ?access_token=, exactly like Phase 5's report download href, so no
    token is ever embedded here server-side."""
    if record.scan_session_id is None:
        return []
    images = (
        db.query(EvidenceImage)
        .filter(EvidenceImage.scan_session_id == record.scan_session_id)
        .order_by(EvidenceImage.uploaded_at)
        .all()
    )
    return [
        {
            "id": str(image.id),
            "fileName": image.storage_key.rsplit("/", 1)[-1],
            "url": f"/evidence-images/{image.id}",
            "sizeBytes": 0,
            "angle": image.angle,
            "altText": f"{_ANGLE_ALT_TEXT.get(image.angle, 'Evidence photograph')} — {product_name}.",
        }
        for image in images
    ]


def _needs_review_flagged(checklist: list | None) -> bool:
    return any(not c["passed"] and "violationCategoryId" not in c for c in (checklist or []))


def _active_review_flag(record: ComplianceRecord, db: DbSession) -> RecordReviewFlag | None:
    return (
        db.query(RecordReviewFlag)
        .filter(RecordReviewFlag.record_id == record.id)
        .filter(RecordReviewFlag.status == "ACTIVE")
        .first()
    )


def _audit_trail(record: ComplianceRecord, db: DbSession) -> list[dict]:
    """Phase 1.2 — the real per-record trail, projected from `audit_events`
    via `ACTIVITY_TO_AUDIT_TYPE` (services/audit/vocabulary.py), replacing
    the two-timestamp synthesis this function used before emit() existed.
    `byUserName` is a live join against `profiles` (not stamped onto the
    event — see AuditEvent's own docstring on which fields ARE historical
    snapshots and which are not)."""
    rows = (
        db.query(AuditEvent, Profile.full_name)
        .outerjoin(Profile, Profile.id == AuditEvent.actor_id)
        .filter(AuditEvent.record_id == record.id)
        .order_by(AuditEvent.created_at)
        .all()
    )
    trail: list[dict] = []
    for event, actor_name in rows:
        audit_type = ACTIVITY_TO_AUDIT_TYPE.get(event.event_type)
        if audit_type is None:
            continue
        entry: dict = {
            "id": str(event.id),
            "type": audit_type,
            "at": event.created_at.isoformat(),
        }
        if event.actor_id is not None:
            entry["byUserId"] = str(event.actor_id)
        if actor_name:
            entry["byUserName"] = actor_name
        trail.append(entry)
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

    captured_images = _real_captured_images(record, db, product_name)
    if not captured_images:
        # Defensive fallback only — a record with a scan_session_id should
        # always have its evidence images; this covers the rare edge case
        # of a record created without one (e.g. old test fixtures).
        captured_images = [_placeholder_image(record_id, record.category, product_name)]
    thumbnail = next((img for img in captured_images if img["angle"] == "front"), captured_images[0])

    review_flag = _active_review_flag(record, db)
    needs_review = _needs_review_flagged(record.checklist) or review_flag is not None

    result = {
        "id": record_id,
        "scanId": str(record.scan_session_id) if record.scan_session_id else record_id,
        "productName": product_name,
        "manufacturerName": record.manufacturer_name_observed or "Unknown manufacturer",
        "category": record.category,
        "region": record.region,
        "source": record.source,
        "verificationStatus": record.verification_status,
        "complianceStatus": record.compliance_status,
        "needsReviewFlag": needs_review,
        "flaggedForEnforcement": active_case is not None,
        "productId": str(link.product_id) if link else None,
        "activeCaseId": str(active_case.id) if active_case else None,
        "enrichmentStatus": "linked" if link else ("pending" if record.verification_status == "Verified" else None),
        "checklist": record.checklist or [],
        "violations": record.violations or [],
        "complianceScore": compliance_score,
        "extraction": record.extraction,
        "evidence": [],
        "auditTrail": _audit_trail(record, db),
        "thumbnail": thumbnail,
        "capturedImages": captured_images,
        "ecommerceListingUrl": None,
        "batchId": None,
        "citizenReport": None,
        "assignedOfficerUserId": str(record.assigned_officer_id) if record.assigned_officer_id else None,
        "scannedAt": record.scanned_at.isoformat() if record.scanned_at else None,
        "lastUpdatedAt": (record.verified_at or record.scanned_at or datetime.now(timezone.utc)).isoformat(),
        "archived": record.archived,
    }
    if review_flag is not None:
        result["needsReviewByUserId"] = str(review_flag.flagged_by)
        if review_flag.note:
            result["needsReviewNote"] = review_flag.note
    return result
