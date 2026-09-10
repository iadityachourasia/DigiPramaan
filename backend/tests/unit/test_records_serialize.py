"""
Unit tests for app/services/records/serialize.py's to_frontend_record() —
mocked DB session (no real Postgres), same convention as
test_records_endpoint.py.
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import MagicMock

from app.services.records.serialize import to_frontend_record


def _fake_record(**kwargs):
    class _Record:
        pass

    r = _Record()
    r.id = kwargs.get("id", uuid.uuid4())
    r.scan_session_id = kwargs.get("scan_session_id", uuid.uuid4())
    r.product_name_observed = kwargs.get("product_name_observed", "Widget")
    r.manufacturer_name_observed = kwargs.get("manufacturer_name_observed", "Acme")
    r.category = kwargs.get("category", "Packaged Food")
    r.region = kwargs.get("region", "Maharashtra")
    r.source = kwargs.get("source", "Officer-Scanned")
    r.verification_status = kwargs.get("verification_status", "Verified")
    r.compliance_status = kwargs.get("compliance_status", "Compliant")
    r.compliance_score = kwargs.get("compliance_score", 90)
    r.compliance_band = kwargs.get("compliance_band", "Good")
    r.extraction = kwargs.get("extraction", {"scanId": "x"})
    r.checklist = kwargs.get("checklist", [])
    r.violations = kwargs.get("violations", [])
    r.assigned_officer_id = kwargs.get("assigned_officer_id", None)
    r.scanned_at = kwargs.get("scanned_at", datetime.datetime.now(datetime.timezone.utc))
    r.verified_at = kwargs.get("verified_at", datetime.datetime.now(datetime.timezone.utc))
    r.verified_by = kwargs.get("verified_by", None)
    r.archived = kwargs.get("archived", False)
    return r


def _db_with_no_link_or_case():
    db = MagicMock()
    db.query.return_value.filter.return_value.filter.return_value.first.return_value = None
    return db


def test_to_frontend_record_basic_shape():
    record = _fake_record()
    db = _db_with_no_link_or_case()
    result = to_frontend_record(record, db)

    assert result["id"] == str(record.id)
    assert result["productName"] == "Widget"
    assert result["manufacturerName"] == "Acme"
    assert result["complianceScore"] == {"value": 90, "band": "Good"}
    assert result["productId"] is None
    assert result["activeCaseId"] is None
    assert result["flaggedForEnforcement"] is False
    assert result["enrichmentStatus"] == "pending"  # Verified but no ACTIVE link
    assert result["archived"] is False
    assert result["thumbnail"]["angle"] == "front"
    assert result["thumbnail"]["url"] == "/images/placeholder/packaged-food.svg"


def test_needs_review_flag_true_for_unresolved_checklist_item():
    record = _fake_record(checklist=[{"fieldId": "x", "passed": False, "value": None, "detail": "unclear"}])
    db = _db_with_no_link_or_case()
    result = to_frontend_record(record, db)
    assert result["needsReviewFlag"] is True


def test_needs_review_flag_false_for_confirmed_violation():
    """A checklist row with passed:false AND a violationCategoryId is a
    CONFIRMED failure, not an unresolved review item."""
    record = _fake_record(
        checklist=[{"fieldId": "x", "passed": False, "value": None, "violationCategoryId": "other", "detail": "x"}]
    )
    db = _db_with_no_link_or_case()
    result = to_frontend_record(record, db)
    assert result["needsReviewFlag"] is False


def test_enrichment_status_none_when_not_verified():
    record = _fake_record(verification_status="Extracted")
    db = _db_with_no_link_or_case()
    result = to_frontend_record(record, db)
    assert result["enrichmentStatus"] is None


def test_audit_trail_includes_verified_entry():
    verified_by = uuid.uuid4()
    record = _fake_record(verified_by=verified_by)
    db = _db_with_no_link_or_case()
    result = to_frontend_record(record, db)
    verified_entries = [e for e in result["auditTrail"] if e["type"] == "Verified"]
    assert len(verified_entries) == 1
    assert verified_entries[0]["byUserId"] == str(verified_by)


def test_placeholder_thumbnail_falls_back_to_other_for_unknown_category():
    record = _fake_record(category="Some Unknown Category")
    db = _db_with_no_link_or_case()
    result = to_frontend_record(record, db)
    assert result["thumbnail"]["url"] == "/images/placeholder/other.svg"
