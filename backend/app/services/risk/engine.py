"""
risk/engine.py — Smart Risk's deterministic, explainable rule evaluation.
Pure functions: take an already-fetched record list, never query the DB
themselves. This is what lets the SAME functions serve two different
callers with two different scopes (see intelligence_loop.py's
recompute_and_persist_risk, which calls these with the FULL unscoped
verified-record set, vs. the Product DNA/Company Profile read endpoints,
which call these again with a jurisdiction-scoped subset — see those
modules' own docstrings on why the persisted risk_alerts rows and a
scoped read's "current risk summary" are deliberately computed
separately).

No ML/LLM — every trigger is a named rule with a fixed point value and an
evidence-record-id list an officer could actually go inspect. Risk is an
enforcement-prioritization signal, never a legal-guilt determination
(compliance_status/legal_status, computed by app/services/rules/, is the
only place that ever decides that).

R1/R2 require the SAME violation category to recur across multiple
verified records — NOT merely "N non-compliant records" — a company or
product with several unrelated one-off violations is not the same risk
signal as one that keeps failing the identical rule.
"""

from __future__ import annotations

import datetime
import uuid
from collections import defaultdict

from app.db.models import ComplianceRecord
from app.services.rules.frontend_adapter import violation_category_label

_REPEAT_WINDOW_DAYS = 90
_COMPANY_REPEAT_THRESHOLD = 3  # R1: same category, >= this many verified records
_PRODUCT_REPEAT_THRESHOLD = 2  # R2: same category, >= this many verified records
_MULTI_PRODUCT_THRESHOLD = 2  # R3: >= this many distinct non-compliant products
_RULE_SCORE = 25

# Risk bands (0-29 LOW / 30-59 MODERATE / 60-79 HIGH / 80-100 CRITICAL) — a
# distinct scale from the unrelated compliance-score bands in rules/aggregate.py.
_CRITICAL_MIN, _HIGH_MIN, _MODERATE_MIN = 80, 60, 30


def _within_repeat_window(verified_at: datetime.datetime | None) -> bool:
    if verified_at is None:
        return False
    now = datetime.datetime.now(datetime.timezone.utc)
    return (now - verified_at) <= datetime.timedelta(days=_REPEAT_WINDOW_DAYS)


def _category_hits(records: list[ComplianceRecord]) -> dict[str, dict[uuid.UUID, ComplianceRecord]]:
    """Maps violationCategoryId -> {record_id: record}, deduplicated so a
    record with the same category appearing twice in its own violations[]
    (shouldn't happen, but never trust it) only counts once."""
    by_category: dict[str, dict[uuid.UUID, ComplianceRecord]] = defaultdict(dict)
    for record in records:
        for violation in (record.violations or []):
            category_id = violation.get("categoryId")
            if category_id:
                by_category[category_id][record.id] = record
    return by_category


def evaluate_company_rules(
    records: list[ComplianceRecord],
    product_id_by_record: dict[uuid.UUID, uuid.UUID],
    open_case_count: int,
) -> list[dict]:
    """R1 (repeat SAME company violation), R3 (multiple distinct
    non-compliant products), R4 (open case) — evaluated over `records`,
    whatever set the caller chose to pass (full or scope-filtered)."""
    triggered: list[dict] = []

    recent = [r for r in records if _within_repeat_window(r.verified_at)]
    for category_id, hits in _category_hits(recent).items():
        if len(hits) >= _COMPANY_REPEAT_THRESHOLD:
            triggered.append({
                "rule_id": "R1",
                "score_contribution": _RULE_SCORE,
                "reason": f"Repeat {violation_category_label(category_id)} violations: "
                          f"{len(hits)} verified inspections in {_REPEAT_WINDOW_DAYS} days.",
                "evidence_record_ids": [str(rid) for rid in hits],
            })

    bad_products = {
        product_id_by_record[r.id] for r in records
        if r.compliance_status == "Non-Compliant" and r.id in product_id_by_record
    }
    if len(bad_products) >= _MULTI_PRODUCT_THRESHOLD:
        bad_records = [r for r in records if product_id_by_record.get(r.id) in bad_products]
        triggered.append({
            "rule_id": "R3",
            "score_contribution": _RULE_SCORE,
            "reason": f"{len(bad_products)} distinct non-compliant products from this legal entity.",
            "evidence_record_ids": [str(r.id) for r in bad_records],
        })

    if open_case_count > 0:
        triggered.append({
            "rule_id": "R4",
            "score_contribution": _RULE_SCORE,
            "reason": f"{open_case_count} unresolved enforcement case(s) open.",
            "evidence_record_ids": [str(r.id) for r in records],
        })

    return triggered


def evaluate_product_rules(records: list[ComplianceRecord], open_case_count: int) -> list[dict]:
    """R2 (repeat SAME product violation), R4 (open case)."""
    triggered: list[dict] = []

    for category_id, hits in _category_hits(records).items():
        if len(hits) >= _PRODUCT_REPEAT_THRESHOLD:
            triggered.append({
                "rule_id": "R2",
                "score_contribution": _RULE_SCORE,
                "reason": f"Repeat {violation_category_label(category_id)} violations on this product: "
                          f"{len(hits)} verified inspections.",
                "evidence_record_ids": [str(rid) for rid in hits],
            })

    if open_case_count > 0:
        triggered.append({
            "rule_id": "R4",
            "score_contribution": _RULE_SCORE,
            "reason": f"{open_case_count} unresolved enforcement case(s) open.",
            "evidence_record_ids": [str(r.id) for r in records],
        })

    return triggered


def aggregate_score(triggered: list[dict]) -> dict:
    """value/band never influence, and are never influenced by,
    compliance_status/legal_status — no shared code path with
    rules/aggregate.py's compute_legal_status/compute_compliance_score."""
    value = min(sum(rule["score_contribution"] for rule in triggered), 100)
    if value >= _CRITICAL_MIN:
        band = "CRITICAL"
    elif value >= _HIGH_MIN:
        band = "HIGH"
    elif value >= _MODERATE_MIN:
        band = "MODERATE"
    else:
        band = "LOW"
    reasons = sorted(triggered, key=lambda r: -r["score_contribution"])
    return {"value": value, "band": band, "reasons": reasons}
