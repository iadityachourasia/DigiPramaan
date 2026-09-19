"""
api/v1/analytics.py — GET /analytics, the mock-to-real port of the
Analytics & Violation Trends page (07). Reuses `apply_officer_scope`
(the same choke point `/dashboard`/`/records` already use — no new
scoping rule invented here) and `dashboard.py::_bucket_trend` for both
the weekly and monthly trend series, rather than duplicating either.

`anomalies` is always `[]` — nothing here is fabricated; the frontend's
own empty state already handles it, matching the mock backend's own
documented behavior (it never computed anomalies either).
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from app.api.deps.permissions import require_permission
from app.api.v1.dashboard import _bucket_trend
from app.db.models import ComplianceRecord, Profile, ScanSession
from app.db.session import get_db
from app.services.scope import apply_officer_scope

router = APIRouter(tags=["analytics"], prefix="/analytics")


def _violation_breakdown(records: list[ComplianceRecord]) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for r in records:
        for v in r.violations or []:
            category_id = v.get("categoryId")
            if category_id:
                counts[category_id] += 1
    return [{"categoryId": k, "count": v} for k, v in sorted(counts.items())]


def _category_breakdown(records: list[ComplianceRecord]) -> list[dict]:
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"compliant": 0, "nonCompliant": 0})
    for r in records:
        if not r.category:
            continue
        if r.compliance_status == "Compliant":
            buckets[r.category]["compliant"] += 1
        elif r.compliance_status == "Non-Compliant":
            buckets[r.category]["nonCompliant"] += 1
    return [{"category": k, **v} for k, v in sorted(buckets.items())]


def _region_breakdown(records: list[ComplianceRecord]) -> list[dict]:
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"totalScanned": 0, "nonCompliant": 0})
    for r in records:
        if not r.region:
            continue
        buckets[r.region]["totalScanned"] += 1
        if r.compliance_status == "Non-Compliant":
            buckets[r.region]["nonCompliant"] += 1
    return [{"region": k, **v} for k, v in sorted(buckets.items())]


def _source_breakdown(records: list[ComplianceRecord]) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for r in records:
        if r.source:
            counts[r.source] += 1
    return [{"source": k, "count": v} for k, v in sorted(counts.items())]


@router.get("")
def get_analytics(
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("analytics.view")),
) -> dict:
    records = apply_officer_scope(db.query(ComplianceRecord), current_user).all()

    total = len(records)
    verified = [r for r in records if r.verification_status == "Verified"]
    verified_decided = [r for r in verified if r.compliance_status in ("Compliant", "Non-Compliant")]
    compliance_rate = (
        round(100 * sum(1 for r in verified_decided if r.compliance_status == "Compliant") / len(verified_decided))
        if verified_decided
        else 0
    )

    scan_session_ids = [r.scan_session_id for r in records if r.scan_session_id is not None]
    if scan_session_ids:
        status_counts = dict(
            db.query(ScanSession.status, func.count(ScanSession.id))
            .filter(ScanSession.id.in_(scan_session_ids))
            .group_by(ScanSession.status)
            .all()
        )
    else:
        status_counts = {}
    completed = status_counts.get("completed", 0)
    failed = status_counts.get("failed", 0)
    processing_success_rate = round(100 * completed / (completed + failed)) if (completed + failed) else 0

    return {
        "summary": {
            "totalScanned": total,
            "complianceRatePercentage": compliance_rate,
            "processingSuccessRatePercentage": processing_success_rate,
        },
        "trends": {
            "weekly": _bucket_trend(records, lambda dt: dt.strftime("%Y-%W")),
            "monthly": _bucket_trend(records, lambda dt: dt.strftime("%Y-%m")),
        },
        "violationBreakdown": _violation_breakdown(records),
        "categoryBreakdown": _category_breakdown(records),
        "regionBreakdown": _region_breakdown(records),
        "sourceBreakdown": _source_breakdown(records),
        "anomalies": [],
    }
