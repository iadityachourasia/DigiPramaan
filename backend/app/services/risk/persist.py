"""
risk/persist.py — writes risk/engine.py's pure rule-evaluation output into
the risk_alerts table. Kept separate from engine.py so the actual rule
logic stays DB-free and independently testable.

Persisted rows are a GLOBAL, audit-style record of what triggered —
computed from the FULL unscoped verified-record set (see
intelligence_loop.py), never from a jurisdiction-scoped subset. A scoped
officer's "current risk summary" in a Product DNA / Company Profile read
is a SEPARATE, live recomputation over their own scoped record list (see
those modules) — it never reads these persisted rows, and never returns
their evidence_record_ids to a scoped caller. This split is what actually
prevents cross-jurisdiction evidence-id leakage; the scope_level/
scope_jurisdiction_id columns below are a durable, meaningful record of
the persisted alert's own geographic footprint (for an unscoped/Admin/
national reader), not the mechanism that enforces per-request scoping.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models import ComplianceRecord, RiskAlert
from app.services.scope import region_jurisdiction_id


def compute_scope_stamp(records: list[ComplianceRecord]) -> tuple[str, uuid.UUID | None]:
    """NATIONAL/None when evidence spans multiple regions or any record
    lacks one (the safe, broadest default — never guess a narrower scope
    than the evidence actually supports). STATE/region-derived-id only
    when every contributing record shares the exact same region."""
    regions = {r.region for r in records}
    if len(regions) == 1:
        region = next(iter(regions))
        if region:
            return "STATE", region_jurisdiction_id(region)
    return "NATIONAL", None


def recompute_and_persist_risk(
    subject_type: str,
    subject_id: uuid.UUID,
    triggered: list[dict],
    scope_level: str,
    scope_jurisdiction_id: uuid.UUID | None,
    db: Session,
) -> None:
    """Upserts by (subject_type, subject_id, rule_id, scope_level,
    scope_jurisdiction_id) — a STATE-scoped and a NATIONAL-scoped instance
    of the same rule can coexist without clobbering each other. Alerts
    previously ACTIVE for this exact scope key that are no longer
    triggered are marked RESOLVED (soft-closed, not deleted — preserves
    history); still-triggered ones are updated in place; new ones are
    inserted ACTIVE."""
    existing_active = (
        db.query(RiskAlert)
        .filter(
            RiskAlert.subject_type == subject_type,
            RiskAlert.subject_id == subject_id,
            RiskAlert.scope_level == scope_level,
            RiskAlert.scope_jurisdiction_id == scope_jurisdiction_id,
            RiskAlert.status == "ACTIVE",
        )
        .all()
    )
    existing_by_rule = {alert.rule_id: alert for alert in existing_active}
    triggered_rule_ids = {rule["rule_id"] for rule in triggered}

    for alert in existing_active:
        if alert.rule_id not in triggered_rule_ids:
            alert.status = "RESOLVED"

    for rule in triggered:
        existing = existing_by_rule.get(rule["rule_id"])
        if existing is not None:
            existing.score_contribution = rule["score_contribution"]
            existing.reason = rule["reason"]
            existing.evidence_record_ids = rule["evidence_record_ids"]
        else:
            db.add(RiskAlert(
                subject_type=subject_type,
                subject_id=subject_id,
                rule_id=rule["rule_id"],
                score_contribution=rule["score_contribution"],
                reason=rule["reason"],
                evidence_record_ids=rule["evidence_record_ids"],
                status="ACTIVE",
                scope_level=scope_level,
                scope_jurisdiction_id=scope_jurisdiction_id,
            ))
