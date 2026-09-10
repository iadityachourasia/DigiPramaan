"""
Unit tests for app/services/reports/snapshot.py's build_report_document() —
pure, no DB. Same fake-object convention as test_risk_engine.py.
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import MagicMock

from app.services.reports.snapshot import build_report_document


def _fake_db_no_cached_explanations() -> MagicMock:
    """A db whose RuleExplanation query always finds nothing — every
    violation falls back to the deterministic rule-engine reason."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    return db


class _FakeRecord:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.scan_session_id = kwargs.get("scan_session_id", uuid.uuid4())
        self.product_name_observed = kwargs.get("product_name_observed", "Refined Groundnut Oil")
        self.manufacturer_name_observed = kwargs.get("manufacturer_name_observed", "SAHYADRI FOODS PVT LTD")
        self.category = kwargs.get("category", "Packaged Food")
        self.region = kwargs.get("region", "Maharashtra")
        self.compliance_status = kwargs.get("compliance_status", "Compliant")
        self.compliance_score = kwargs.get("compliance_score", 100)
        self.violations = kwargs.get("violations", [])
        self.verified_at = kwargs.get("verified_at", datetime.datetime.now(datetime.timezone.utc))


class _FakeProfile:
    def __init__(self, full_name="Field Inspector", role="Enforcement Officer", region="Maharashtra"):
        self.full_name = full_name
        self.role = role
        self.region = region


def test_build_report_document_shape():
    record = _FakeRecord()
    profile = _FakeProfile()
    doc = build_report_document(record, profile, base_url="http://localhost:3000", db=_fake_db_no_cached_explanations())

    assert doc["title"] == "Legal Metrology Compliance Report"
    assert doc["totalRecords"] == 1
    assert doc["truncated"] is False
    assert doc["referenceCode"]
    assert doc["verifyUrl"].startswith("http://localhost:3000/en/reports?reference=")
    assert doc["attribution"] == {
        "kind": "verifier",
        "name": "Field Inspector",
        "role": "Enforcement Officer",
        "region": "Maharashtra",
        "verifiedAt": record.verified_at.isoformat(),
    }
    section = doc["records"][0]
    assert section["recordId"] == str(record.id)
    assert section["productName"] == "Refined Groundnut Oil"
    assert section["manufacturerName"] == "SAHYADRI FOODS PVT LTD"
    assert section["complianceStatus"] == "Compliant"
    assert section["complianceScore"] == 100
    assert section["violations"] == []


def test_build_report_document_carries_violations():
    record = _FakeRecord(
        compliance_status="Non-Compliant",
        compliance_score=40,
        violations=[
            {"categoryId": "mrp-non-compliance", "category": "MRP Non-Compliance", "legalBasis": "Rule 6(e)", "detail": "MRP absent"},
        ],
    )
    doc = build_report_document(
        record, _FakeProfile(), base_url="http://localhost:3000", db=_fake_db_no_cached_explanations()
    )
    section = doc["records"][0]
    assert section["violations"] == [
        {
            "category": "MRP Non-Compliance", "legalBasis": "Rule 6(e)", "detail": "MRP absent",
            # No cached Gemini explanation in this test — falls back to the
            # deterministic rule-engine reason (`detail`), never blank.
            "explanation": "MRP absent",
        }
    ]


def test_uses_cached_explanation_summary_when_present():
    """(L) complement: when a cached RuleExplanation exists, its summary is
    used instead of the deterministic fallback."""
    record = _FakeRecord(
        compliance_status="Non-Compliant",
        violations=[
            {
                "categoryId": "mrp-non-compliance", "category": "MRP Non-Compliance",
                "legalBasis": "Rule 6(e)", "detail": "MRP absent", "ruleId": "rule_6e_mrp",
            },
        ],
    )
    db = MagicMock()
    cached = MagicMock()
    cached.explanation = {"summary": "The MRP declaration could not be found on the label."}
    db.query.return_value.filter.return_value.first.return_value = cached

    doc = build_report_document(record, _FakeProfile(), base_url="http://localhost:3000", db=db)
    section = doc["records"][0]
    assert section["violations"][0]["explanation"] == "The MRP declaration could not be found on the label."


def test_two_calls_produce_different_reference_codes():
    """Each generation gets its own reference code — never reused across
    separate reports for the same record."""
    record = _FakeRecord()
    doc1 = build_report_document(
        record, _FakeProfile(), base_url="http://localhost:3000", db=_fake_db_no_cached_explanations()
    )
    doc2 = build_report_document(
        record, _FakeProfile(), base_url="http://localhost:3000", db=_fake_db_no_cached_explanations()
    )
    assert doc1["referenceCode"] != doc2["referenceCode"]
