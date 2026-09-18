"""
company_profile/aggregate.py — Company Compliance Profile, computed live
over VERIFIED records only, scoped to the requesting officer via
app.services.scope.apply_officer_scope — never a separately-maintained
aggregate table, so there is nothing to keep in sync as new verifications
land (the same "compute live over scoped records" discipline the
frontend's own ManufacturerScorecard already established for its
equivalent numbers).
"""

from __future__ import annotations

import datetime
import uuid
from collections import Counter, defaultdict

from sqlalchemy.orm import Session

from app.db.models import ComplianceRecord, LegalEntity, Product, ProductInspectionLink, ViolationCase, Profile
from app.services.risk.engine import aggregate_score, evaluate_company_rules
from app.services.scope import apply_officer_scope

# Matches the frontend's own REPEAT_VIOLATION_THRESHOLD (src/types/manufacturer.ts).
_REPEAT_VIOLATION_COUNT = 3
_REPEAT_VIOLATION_DAYS = 90

# Trend is only meaningful with enough history to bucket — below this,
# report no trend rather than a noisy 1-2-point line.
_MIN_RECORDS_FOR_TREND = 5
_RECENT_INSPECTIONS_LIMIT = 10


def _linked_records(legal_entity_id: uuid.UUID, db: Session) -> list[tuple[ComplianceRecord, uuid.UUID]]:
    rows = (
        db.query(ComplianceRecord, Product.id)
        .join(ProductInspectionLink, ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
        .join(Product, Product.id == ProductInspectionLink.product_id)
        .filter(Product.legal_entity_id == legal_entity_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .filter(ComplianceRecord.verification_status == "Verified")
        .all()
    )
    return list(rows)


def build_company_profile(legal_entity_id: uuid.UUID, db: Session, current_user: Profile) -> dict | None:
    legal_entity = db.get(LegalEntity, legal_entity_id)
    if legal_entity is None:
        return None

    rows = _linked_records(legal_entity_id, db)
    query_records = [r for r, _ in rows]
    product_id_by_record = {r.id: pid for r, pid in rows}

    scoped_ids = {
        r.id for r in apply_officer_scope(
            db.query(ComplianceRecord).filter(ComplianceRecord.id.in_([r.id for r in query_records])),
            current_user,
        ).all()
    }
    records = [r for r in query_records if r.id in scoped_ids]
    # Phase 1.1 (F-001 closure): visible only if the viewer's own scope
    # covers at least one verified record linked to this entity — never
    # metadata-only (name) access to an entity every linked record of
    # which is out of jurisdiction. Same 404 as a nonexistent entity.
    if not records:
        return None

    total = len(records)
    distinct_products = len({product_id_by_record[r.id] for r in records})
    compliant_count = sum(1 for r in records if r.compliance_status == "Compliant")
    non_compliant_count = sum(1 for r in records if r.compliance_status == "Non-Compliant")
    compliance_rate = round(compliant_count / total * 100) if total else 0

    trend = None
    if total >= _MIN_RECORDS_FOR_TREND:
        buckets: dict[str, list[ComplianceRecord]] = defaultdict(list)
        for r in records:
            if r.verified_at:
                bucket_key = r.verified_at.strftime("%Y-%W")  # ISO-ish year-week bucket
                buckets[bucket_key].append(r)
        trend = [
            {
                "period": key,
                "ratePercentage": round(
                    sum(1 for r in bucket if r.compliance_status == "Compliant") / len(bucket) * 100
                ),
                "sampleSize": len(bucket),
            }
            for key, bucket in sorted(buckets.items())
        ]

    violation_counts: Counter[str] = Counter()
    for r in records:
        for v in (r.violations or []):
            if v.get("categoryId"):
                violation_counts[v["categoryId"]] += 1
    violation_distribution = [
        {"categoryId": cat, "count": count} for cat, count in violation_counts.most_common()
    ]

    now = datetime.datetime.now(datetime.timezone.utc)
    recent_non_compliant = [
        r for r in records
        if r.compliance_status == "Non-Compliant"
        and r.verified_at
        and (now - r.verified_at) <= datetime.timedelta(days=_REPEAT_VIOLATION_DAYS)
    ]
    repeat_violation_flagged = len(recent_non_compliant) >= _REPEAT_VIOLATION_COUNT

    record_ids = [r.id for r in records]
    open_case_count = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id.in_(record_ids))
        .filter(ViolationCase.status != "CLOSED")
        .count()
        if record_ids else 0
    )

    triggered = evaluate_company_rules(records, product_id_by_record, open_case_count)
    risk = aggregate_score(triggered)

    recent_inspections = sorted(
        records, key=lambda r: r.verified_at or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
        reverse=True,
    )[:_RECENT_INSPECTIONS_LIMIT]

    return {
        "legalEntity": {"id": str(legal_entity.id), "name": legal_entity.name},
        "totalVerifiedInspections": total,
        "distinctProductCount": distinct_products,
        "compliantCount": compliant_count,
        "nonCompliantCount": non_compliant_count,
        "complianceRatePercentage": compliance_rate,
        "complianceTrend": trend,
        "violationDistribution": violation_distribution,
        "repeatViolationFlagged": repeat_violation_flagged,
        "recentNonCompliantCount": len(recent_non_compliant),
        "openCaseCount": open_case_count,
        "riskScore": risk["value"],
        "riskLevel": risk["band"],
        "topRiskReasons": [r["reason"] for r in risk["reasons"][:3]],
        "recentInspections": [
            {
                "recordId": str(r.id),
                "scannedAt": r.scanned_at.isoformat() if r.scanned_at else None,
                "verifiedAt": r.verified_at.isoformat() if r.verified_at else None,
                "complianceStatus": r.compliance_status,
                "complianceScore": r.compliance_score,
                # Phase 5: enough extra fields for the Manufacturer Scorecard
                # adapter to build a minimal-but-valid ComplianceRecord for
                # each row without a second, N+1 fetch per record.
                "productName": r.product_name_observed,
                "manufacturerName": r.manufacturer_name_observed,
                "source": r.source,
                "category": r.category,
                "region": r.region,
                "violationCount": len(r.violations or []),
            }
            for r in recent_inspections
        ],
    }
