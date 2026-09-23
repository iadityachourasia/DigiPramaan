"""
Unit tests for app/api/v1/analytics.py's pure breakdown helpers — no DB,
matching test_dashboard_aggregate.py's own "pure math unit-tested, DB
query integration-tested" split.
"""

from __future__ import annotations

import uuid

from app.api.v1.analytics import (
    _category_breakdown,
    _region_breakdown,
    _source_breakdown,
    _violation_breakdown,
)


def _record(**overrides):
    class _Record:
        pass

    r = _Record()
    r.id = uuid.uuid4()
    r.compliance_status = overrides.get("compliance_status", "Compliant")
    r.category = overrides.get("category")
    r.region = overrides.get("region")
    r.source = overrides.get("source")
    r.violations = overrides.get("violations", [])
    return r


def test_violation_breakdown_counts_per_category():
    records = [
        _record(violations=[{"categoryId": "rule6a"}, {"categoryId": "rule6b"}]),
        _record(violations=[{"categoryId": "rule6a"}]),
    ]
    result = _violation_breakdown(records)
    assert {"categoryId": "rule6a", "count": 2} in result
    assert {"categoryId": "rule6b", "count": 1} in result


def test_violation_breakdown_ignores_entries_without_category_id():
    records = [_record(violations=[{"detail": "no category"}])]
    assert _violation_breakdown(records) == []


def test_category_breakdown_splits_compliant_and_non_compliant():
    records = [
        _record(category="Packaged Food", compliance_status="Compliant"),
        _record(category="Packaged Food", compliance_status="Non-Compliant"),
        _record(category="Packaged Food", compliance_status="Non-Compliant"),
    ]
    result = _category_breakdown(records)
    assert result == [{"category": "Packaged Food", "compliant": 1, "nonCompliant": 2}]


def test_category_breakdown_skips_records_with_no_category():
    records = [_record(category=None)]
    assert _category_breakdown(records) == []


def test_region_breakdown_counts_total_and_non_compliant():
    records = [
        _record(region="Maharashtra", compliance_status="Non-Compliant"),
        _record(region="Maharashtra", compliance_status="Compliant"),
        _record(region="Delhi", compliance_status="Non-Compliant"),
    ]
    result = {e["region"]: e for e in _region_breakdown(records)}
    assert result["Maharashtra"] == {"region": "Maharashtra", "totalScanned": 2, "nonCompliant": 1}
    assert result["Delhi"] == {"region": "Delhi", "totalScanned": 1, "nonCompliant": 1}


def test_source_breakdown_counts_per_source():
    records = [_record(source="Officer-Scanned"), _record(source="Officer-Scanned"), _record(source="Citizen-Reported")]
    result = {e["source"]: e["count"] for e in _source_breakdown(records)}
    assert result == {"Officer-Scanned": 2, "Citizen-Reported": 1}
