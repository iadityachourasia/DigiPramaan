"""
Safe integration tests for Phase 6's Gemini violation explanation
persistence/caching — real dev DB, mocked Gemini client (no real API calls
needed to prove the caching/immutability behavior, which is the point of
these tests). Creates its own ComplianceRecord + RuleExplanation rows and
cleans them up in its own fixture teardown.
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.api.v1.explanations import explain_rule_violation
from app.core.config import get_settings
from app.db.models import ComplianceRecord, Profile, RuleExplanation
from app.db.session import SessionLocal
from app.services.explanation.gemini_explainer import ExplanationOutput
from app.services.rules.types import RuleResult, RuleStatus

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com

_FAKE_OUTPUT = ExplanationOutput(
    summary="The MRP declaration's numeral height could not be confirmed as meeting the required minimum.",
    whatWasFound="Measured height 2.00mm.", whatIsMissingOrWrong="Below the required minimum.",
    legalContext="Rule 7 of the Legal Metrology (Packaged Commodities) Rules, 2011.",
    evidenceExplanation="Measured via officer calibration and connected-component analysis.",
    officerGuidance="Confirm manually with a physical scale if in doubt.",
    insufficientContext=False,
)


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_record_ids"] = []
        yield session
        session.rollback()
        record_ids = session.info["created_record_ids"]
        if record_ids:
            session.query(RuleExplanation).filter(RuleExplanation.compliance_record_id.in_(record_ids)).delete(
                synchronize_session=False
            )
            session.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(
                synchronize_session=False
            )
        session.commit()


def _make_record_with_rule7_fail(db) -> ComplianceRecord:
    unique = uuid.uuid4().hex[:8]
    rule_result = RuleResult(
        rule_id="rule_7_font_size", rule_name="Numeral/letter height", field_id="fontSize",
        status=RuleStatus.FAIL, legal_basis="Rule 7",
        message="Measured height 2.00mm is below the required 4.0mm minimum.", value="2.00mm",
    )
    record = ComplianceRecord(
        product_name_observed=f"Test Product {unique}", manufacturer_name_observed=f"Test Mfr {unique}",
        category="Packaged Food", region="Maharashtra", source="Officer-Scanned",
        verification_status="Extracted", compliance_status="Non-Compliant",
        evidence_bundle={
            "structured_extraction": {
                "manufacturer": {"value": f"Test Mfr {unique}", "not_detected": False, "evidence": []},
                "generic_name": {"value": "Test Product", "not_detected": False, "evidence": []},
                "net_quantity": {"value": None, "not_detected": True, "evidence": []},
                "manufacture_or_import_date": {"value": None, "not_detected": True, "evidence": []},
                "mrp": {"value": "Rs 100.00", "not_detected": False, "evidence": []},
                "consumer_care": {"value": None, "not_detected": True, "evidence": []},
            },
            "rule_results": [rule_result.model_dump()],
            "calibrations": [],
        },
        checklist=[], violations=[],
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    return record


def _profile(db) -> Profile:
    return db.get(Profile, _INSPECTOR_ID)


# --- (K) repeated explain call uses the cache -------------------------------

def test_repeated_explain_call_uses_cache(db):
    record = _make_record_with_rule7_fail(db)
    db.commit()
    settings = get_settings()

    with patch("app.api.v1.explanations.explain_violation", return_value=_FAKE_OUTPUT) as mocked:
        first = explain_rule_violation(record.id, "rule_7_font_size", db=db, settings=settings, current_user=_profile(db))
        second = explain_rule_violation(record.id, "rule_7_font_size", db=db, settings=settings, current_user=_profile(db))

    assert mocked.call_count == 1, "a second call with an unchanged rule result must not re-call Gemini"
    assert first["explanation"] == second["explanation"]
    assert first["cached"] is False
    assert second["cached"] is True

    rows = db.query(RuleExplanation).filter(RuleExplanation.compliance_record_id == record.id).all()
    assert len(rows) == 1


# --- (J) explanation cannot alter the authoritative status ------------------

def test_explanation_does_not_change_compliance_status(db):
    record = _make_record_with_rule7_fail(db)
    db.commit()
    settings = get_settings()
    status_before = record.compliance_status
    checklist_before = record.checklist

    with patch("app.api.v1.explanations.explain_violation", return_value=_FAKE_OUTPUT):
        explain_rule_violation(record.id, "rule_7_font_size", db=db, settings=settings, current_user=_profile(db))

    db.refresh(record)
    assert record.compliance_status == status_before
    assert record.checklist == checklist_before


# --- (I)/(L)-adjacent: verified record's explanation stays tied to the frozen result ---

def test_verified_record_explanation_stays_stable(db):
    record = _make_record_with_rule7_fail(db)
    db.commit()
    settings = get_settings()

    with patch("app.api.v1.explanations.explain_violation", return_value=_FAKE_OUTPUT) as mocked:
        explain_rule_violation(record.id, "rule_7_font_size", db=db, settings=settings, current_user=_profile(db))

    record.verification_status = "Verified"
    record.verified_at = datetime.datetime.now(datetime.timezone.utc)
    record.verified_by = _INSPECTOR_ID
    db.commit()

    with patch("app.api.v1.explanations.explain_violation", return_value=_FAKE_OUTPUT) as mocked_after:
        result = explain_rule_violation(record.id, "rule_7_font_size", db=db, settings=settings, current_user=_profile(db))

    assert mocked_after.call_count == 0, "post-verification, the same rule result must still hit the cache"
    assert result["explanation"] == _FAKE_OUTPUT.model_dump()
    _ = mocked
