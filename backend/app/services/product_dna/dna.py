"""
product_dna/dna.py — the GET /products/{id}/dna read-side aggregation.
Separate from identity.py (which resolves/creates Product/LegalEntity rows
at verification time) — this module only ever reads.
"""

from __future__ import annotations

import datetime
import uuid
from collections import Counter

from sqlalchemy.orm import Session

from app.db.models import ComplianceRecord, LegalEntity, Product, ProductInspectionLink, Profile, ViolationCase
from app.services.risk.engine import aggregate_score, evaluate_product_rules
from app.services.scope import apply_officer_scope


def _linked_records(product_id: uuid.UUID, db: Session, current_user: Profile) -> list[ComplianceRecord]:
    query = (
        db.query(ComplianceRecord)
        .join(ProductInspectionLink, ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
        .filter(ProductInspectionLink.product_id == product_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .filter(ComplianceRecord.verification_status == "Verified")
    )
    return apply_officer_scope(query, current_user).order_by(ComplianceRecord.verified_at).all()


def build_product_dna(product_id: uuid.UUID, db: Session, current_user: Profile) -> dict | None:
    product = db.get(Product, product_id)
    if product is None:
        return None
    legal_entity = db.get(LegalEntity, product.legal_entity_id)

    records = _linked_records(product_id, db, current_user)
    record_ids = [r.id for r in records]

    violation_counts: Counter[str] = Counter()
    for r in records:
        for v in (r.violations or []):
            if v.get("categoryId"):
                violation_counts[v["categoryId"]] += 1
    recurring_violations = [
        {"categoryId": cat, "count": count} for cat, count in violation_counts.items() if count >= 2
    ]

    open_case = None
    if record_ids:
        open_case = (
            db.query(ViolationCase)
            .filter(ViolationCase.originating_record_id.in_(record_ids))
            .filter(ViolationCase.status != "CLOSED")
            .order_by(ViolationCase.created_at.desc())
            .first()
        )

    triggered = evaluate_product_rules(records, 1 if open_case else 0)
    risk = aggregate_score(triggered)

    return {
        "productId": str(product.id),
        "fingerprintHash": product.fingerprint_hash,
        "brand": product.brand,
        "genericName": product.generic_name,
        "netQuantityNormalized": product.net_quantity_normalized,
        "category": product.category,
        "legalEntity": (
            {"id": str(legal_entity.id), "name": legal_entity.name} if legal_entity else None
        ),
        "inspectionTimeline": [
            {
                "recordId": str(r.id),
                "scannedAt": r.scanned_at.isoformat() if r.scanned_at else None,
                "verifiedAt": r.verified_at.isoformat() if r.verified_at else None,
                "complianceStatus": r.compliance_status,
                "complianceScore": r.compliance_score,
            }
            for r in records
        ],
        "recurringViolations": recurring_violations,
        "relatedRecordIds": [str(rid) for rid in record_ids],
        "openCase": (
            {"id": str(open_case.id), "status": open_case.status} if open_case else None
        ),
        "riskScore": risk["value"],
        "riskLevel": risk["band"],
        "riskReasons": [r["reason"] for r in risk["reasons"]],
    }
