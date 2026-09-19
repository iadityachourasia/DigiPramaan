"""
api/v1/companies.py — GET /companies/{id}/profile, Company Compliance
Profile's one read endpoint. Same auth convention as products.py: any
authenticated user, jurisdiction-scoped via app.services.scope.
"""

from __future__ import annotations

import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.api.deps.permissions import require_permission
from app.db.models import ComplianceRecord, LegalEntity, Product, ProductInspectionLink, Profile, ViolationCase
from app.db.session import get_db
from app.services.admin.thresholds import get_effective_thresholds
from app.services.cases.flagging import flag_record_for_enforcement
from app.services.company_profile.aggregate import build_company_profile
from app.services.records.serialize import to_frontend_record
from app.services.scope import apply_officer_scope

router = APIRouter(tags=["companies"], prefix="/companies")


@router.get("")
def list_companies(db: DbSession = Depends(get_db), current_user: Profile = Depends(get_current_user)) -> list[dict]:
    """Phase 5: real backing for the Manufacturer list (page 9's grid of
    ScorecardCards) — every LegalEntity with at least one verified,
    scoped, ACTIVE-linked record. Lighter than calling
    build_company_profile() once per entity: one pass over scoped verified
    records, grouped by entity, rather than N full aggregate builds."""
    rows = (
        db.query(ComplianceRecord, Product.legal_entity_id)
        .join(ProductInspectionLink, ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
        .join(Product, Product.id == ProductInspectionLink.product_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .filter(ComplianceRecord.verification_status == "Verified")
    )
    rows = apply_officer_scope(rows, current_user).all()

    by_entity: dict[uuid.UUID, list[ComplianceRecord]] = {}
    for record, entity_id in rows:
        by_entity.setdefault(entity_id, []).append(record)

    if not by_entity:
        return []

    entities = db.query(LegalEntity).filter(LegalEntity.id.in_(by_entity.keys())).all()
    summaries = []
    for entity in entities:
        records = by_entity[entity.id]
        total = len(records)
        compliant = sum(1 for r in records if r.compliance_status == "Compliant")
        scanned_dates = [r.scanned_at for r in records if r.scanned_at]
        summaries.append({
            "id": str(entity.id),
            "name": entity.name,
            "totalVerifiedInspections": total,
            "complianceRatePercentage": round(compliant / total * 100) if total else 0,
            "firstScannedAt": min(scanned_dates).isoformat() if scanned_dates else None,
            "lastScannedAt": max(scanned_dates).isoformat() if scanned_dates else None,
        })
    return sorted(summaries, key=lambda s: s["name"])


@router.get("/{legal_entity_id}/profile")
def get_company_profile(
    legal_entity_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    profile = build_company_profile(legal_entity_id, db, current_user)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legal entity not found")
    return profile


@router.post("/{legal_entity_id}/flag-enforcement")
def flag_manufacturer_for_enforcement(
    legal_entity_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.flagForEnforcement")),
) -> dict:
    """The manufacturer-scoped bulk version of records.py::flag_for_
    enforcement — same underlying `flag_record_for_enforcement`, applied
    to every visible, verified, Non-Compliant record of this legal entity
    within the (admin-configurable) repeat-violation window that doesn't
    already have an open case."""
    entity = db.get(LegalEntity, legal_entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    thresholds = get_effective_thresholds(db)
    window_days = thresholds["repeatViolationDays"]
    now = datetime.datetime.now(datetime.timezone.utc)

    rows = (
        db.query(ComplianceRecord)
        .join(ProductInspectionLink, ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
        .join(Product, Product.id == ProductInspectionLink.product_id)
        .filter(Product.legal_entity_id == legal_entity_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .filter(ComplianceRecord.verification_status == "Verified")
        .filter(ComplianceRecord.compliance_status == "Non-Compliant")
    )
    candidates = apply_officer_scope(rows, current_user).all()
    candidates = [
        r for r in candidates
        if r.verified_at and (now - r.verified_at) <= datetime.timedelta(days=window_days)
    ]
    if not candidates:
        return {"flagged": [], "skipped": [], "alreadyFlagged": []}

    record_ids = [r.id for r in candidates]
    open_case_record_ids = {
        c.originating_record_id
        for c in db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id.in_(record_ids))
        .filter(ViolationCase.status != "CLOSED")
        .all()
    }

    flagged: list[dict] = []
    already_flagged: list[str] = []
    skipped: list[str] = []
    for record in candidates:
        if record.id in open_case_record_ids:
            already_flagged.append(str(record.id))
            continue
        try:
            _case, was_created = flag_record_for_enforcement(db, record, current_user)
        except HTTPException:
            skipped.append(str(record.id))
            continue
        if was_created:
            db.refresh(record)
            flagged.append(to_frontend_record(record, db))
        else:
            already_flagged.append(str(record.id))

    return {"flagged": flagged, "skipped": skipped, "alreadyFlagged": already_flagged}
