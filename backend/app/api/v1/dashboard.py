"""
api/v1/dashboard.py — Phase 5's GET /dashboard, the one scoped aggregate that
powers the existing Dashboard page (src/components/dashboard/DashboardView.tsx)
for real. KPI/trend/alert math mirrors company_profile/aggregate.py's own
bucketing and risk-evaluation style rather than inventing a second convention.

Smart Risk surfaces here as DashboardAlert rows (no new page) — each message
literally states rule id + reason + score contribution, satisfying "Smart Risk
must show WHY" using a component that already exists and already renders
`message` as-is.
"""

from __future__ import annotations

import datetime
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.db.models import ComplianceRecord, LegalEntity, Product, ProductInspectionLink, Profile, ViolationCase
from app.db.session import get_db
from app.services.records.serialize import to_frontend_record
from app.services.risk.engine import aggregate_score, evaluate_company_rules, evaluate_product_rules
from app.services.scope import apply_officer_scope

router = APIRouter(tags=["dashboard"], prefix="/dashboard")

_RECENT_SCANS_LIMIT = 10
_MAX_ALERTS = 10
_SEVERITY_BY_BAND = {"CRITICAL": "error", "HIGH": "error", "MODERATE": "warning", "LOW": "info"}


def _kpi(kpi_id: str, value: int, routes_to_status: str | None = None) -> dict:
    body = {"id": kpi_id, "value": value, "deltaPercentage": 0}
    if routes_to_status:
        body["routesToStatus"] = routes_to_status
    return body


def _bucket_trend(records: list[ComplianceRecord], key_fn) -> list[dict]:
    buckets: dict[str, list[ComplianceRecord]] = defaultdict(list)
    for r in records:
        if r.verified_at:
            buckets[key_fn(r.verified_at)].append(r)
    return [
        {
            "date": key,
            "compliant": sum(1 for r in bucket if r.compliance_status == "Compliant"),
            "nonCompliant": sum(1 for r in bucket if r.compliance_status == "Non-Compliant"),
            "totalScans": len(bucket),
        }
        for key, bucket in sorted(buckets.items())
    ]


def _risk_alerts(records: list[ComplianceRecord], db: DbSession, current_user: Profile) -> list[dict]:
    """One pass over the caller's scoped verified records, grouping by legal
    entity and by product exactly like Company Profile / Product DNA do
    individually — computed here for every subject visible to this officer
    at once, since a dashboard alert feed needs "what's risky right now",
    not one subject at a time."""
    verified = [r for r in records if r.verification_status == "Verified"]
    record_ids = [r.id for r in verified]
    if not record_ids:
        return []

    links = (
        db.query(ProductInspectionLink, Product.legal_entity_id)
        .join(Product, Product.id == ProductInspectionLink.product_id)
        .filter(ProductInspectionLink.compliance_record_id.in_(record_ids))
        .filter(ProductInspectionLink.status == "ACTIVE")
        .all()
    )
    product_id_by_record = {link.compliance_record_id: link.product_id for link, _ in links}
    entity_id_by_record = {link.compliance_record_id: entity_id for link, entity_id in links}

    open_cases = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id.in_(record_ids))
        .filter(ViolationCase.status != "CLOSED")
        .all()
    )
    open_case_records_by_id = {c.originating_record_id for c in open_cases}

    by_entity: dict = defaultdict(list)
    by_product: dict = defaultdict(list)
    for r in verified:
        if r.id in entity_id_by_record:
            by_entity[entity_id_by_record[r.id]].append(r)
        if r.id in product_id_by_record:
            by_product[product_id_by_record[r.id]].append(r)

    alerts: list[dict] = []

    for entity_id, entity_records in by_entity.items():
        entity_record_ids = {r.id for r in entity_records}
        open_count = len(open_case_records_by_id & entity_record_ids)
        pid_map = {r.id: product_id_by_record[r.id] for r in entity_records if r.id in product_id_by_record}
        triggered = evaluate_company_rules(entity_records, pid_map, open_count)
        if not triggered:
            continue
        entity = db.get(LegalEntity, entity_id)
        risk = aggregate_score(triggered)
        for rule in triggered:
            alerts.append({
                "id": f"company-{entity_id}-{rule['rule_id']}",
                "severity": _SEVERITY_BY_BAND[risk["band"]],
                "message": f"{rule['rule_id']}: {rule['reason']} (+{rule['score_contribution']})",
                "href": f"/companies/{entity_id}",
                "_score": rule["score_contribution"],
            })
        _ = entity  # name available if a richer message is added later

    for product_id, product_records in by_product.items():
        product_record_ids = {r.id for r in product_records}
        open_count = len(open_case_records_by_id & product_record_ids)
        triggered = evaluate_product_rules(product_records, open_count)
        if not triggered:
            continue
        risk = aggregate_score(triggered)
        for rule in triggered:
            alerts.append({
                "id": f"product-{product_id}-{rule['rule_id']}",
                "severity": _SEVERITY_BY_BAND[risk["band"]],
                "message": f"{rule['rule_id']}: {rule['reason']} (+{rule['score_contribution']})",
                "href": f"/products/{product_id}",
                "_score": rule["score_contribution"],
            })

    alerts.sort(key=lambda a: -a["_score"])
    for a in alerts:
        del a["_score"]
    return alerts[:_MAX_ALERTS]


@router.get("")
def get_dashboard(db: DbSession = Depends(get_db), current_user: Profile = Depends(get_current_user)) -> dict:
    records = apply_officer_scope(db.query(ComplianceRecord), current_user).all()

    total = len(records)
    compliant = sum(1 for r in records if r.compliance_status == "Compliant")
    non_compliant = sum(1 for r in records if r.compliance_status == "Non-Compliant")
    pending = sum(1 for r in records if r.verification_status != "Verified")

    kpis = [
        _kpi("productsScanned", total),
        _kpi("compliant", compliant, "Compliant"),
        _kpi("nonCompliant", non_compliant, "Non-Compliant"),
        _kpi("pending", pending, "Pending"),
    ]

    trends = {
        "weekly": _bucket_trend(records, lambda dt: dt.strftime("%Y-%W")),
        "monthly": _bucket_trend(records, lambda dt: dt.strftime("%Y-%m")),
    }

    recent_scans = sorted(
        records,
        key=lambda r: r.scanned_at or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
        reverse=True,
    )[:_RECENT_SCANS_LIMIT]

    body = {
        "kpis": kpis,
        "trends": trends,
        "recentScans": [to_frontend_record(r, db) for r in recent_scans],
        "alerts": _risk_alerts(records, db, current_user),
    }

    if current_user.jurisdiction_level in (None, "National"):
        region_counts: dict = defaultdict(lambda: {"totalScanned": 0, "nonCompliant": 0})
        for r in records:
            if not r.region:
                continue
            region_counts[r.region]["totalScanned"] += 1
            if r.compliance_status == "Non-Compliant":
                region_counts[r.region]["nonCompliant"] += 1
        body["regionalDistribution"] = [
            {"region": region, **counts} for region, counts in sorted(region_counts.items())
        ]
    else:
        body["regionalDistribution"] = []

    return body
