"""
Unit tests for app/api/v1/dashboard.py's pure helpers (_kpi, _bucket_trend) —
no DB. The full get_dashboard() endpoint needs a real scoped query and is
covered by manual/integration testing instead (same split test_risk_engine.py
uses: pure rule math unit-tested, DB-backed aggregation integration-tested).
"""

from __future__ import annotations

import datetime
import uuid

from app.api.v1.dashboard import _bucket_trend, _kpi


def _record(compliance_status="Compliant", verified_at=None):
    class _Record:
        pass

    r = _Record()
    r.id = uuid.uuid4()
    r.compliance_status = compliance_status
    r.verified_at = verified_at
    return r


def test_kpi_shape_and_zero_delta():
    kpi = _kpi("compliant", 5, "Compliant")
    assert kpi == {"id": "compliant", "value": 5, "deltaPercentage": 0, "routesToStatus": "Compliant"}


def test_kpi_omits_routes_to_status_when_not_given():
    kpi = _kpi("productsScanned", 10)
    assert "routesToStatus" not in kpi
    assert kpi["value"] == 10


def test_bucket_trend_groups_by_key_and_counts_compliance():
    now = datetime.datetime(2026, 3, 10, tzinfo=datetime.timezone.utc)
    records = [
        _record("Compliant", now),
        _record("Non-Compliant", now),
        _record("Compliant", now + datetime.timedelta(days=1)),
    ]
    trend = _bucket_trend(records, lambda dt: dt.strftime("%Y-%m-%d"))
    assert len(trend) == 2
    day1 = next(t for t in trend if t["date"] == "2026-03-10")
    assert day1 == {"date": "2026-03-10", "compliant": 1, "nonCompliant": 1, "totalScans": 2}


def test_bucket_trend_ignores_unverified_records():
    records = [_record("Compliant", verified_at=None)]
    trend = _bucket_trend(records, lambda dt: dt.strftime("%Y-%m-%d"))
    assert trend == []


def test_bucket_trend_sorted_by_key():
    now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    records = [
        _record("Compliant", now + datetime.timedelta(days=10)),
        _record("Compliant", now),
    ]
    trend = _bucket_trend(records, lambda dt: dt.strftime("%Y-%m-%d"))
    assert [t["date"] for t in trend] == sorted(t["date"] for t in trend)
