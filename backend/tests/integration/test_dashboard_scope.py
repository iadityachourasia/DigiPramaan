"""
Safe integration test proving Phase 5's GET /dashboard respects jurisdiction
scoping (apply_officer_scope) for recentScans/kpis — an Enforcement Officer
scoped to one region/assignment must never see another region's or another
officer's records in their own dashboard aggregate. Same
create-own-rows-and-clean-up discipline as test_intelligence_loop.py.
"""

from __future__ import annotations

import datetime
import uuid

import pytest

from app.api.v1.dashboard import get_dashboard
from app.db.models import ComplianceRecord, Profile
from app.db.session import SessionLocal

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com — Enforcement Officer, Maharashtra


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_record_ids"] = []
        yield session
        session.rollback()
        record_ids = session.info["created_record_ids"]
        if record_ids:
            session.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(
                synchronize_session=False
            )
            session.commit()


def _make_record(db, *, region, assigned_officer_id, unique):
    record = ComplianceRecord(
        product_name_observed=f"Scope Test Product {unique}",
        manufacturer_name_observed=f"Scope Test Mfr {unique}",
        category="Packaged Food",
        region=region,
        source="Officer-Scanned",
        verification_status="Verified",
        compliance_status="Compliant",
        compliance_score=100,
        compliance_band="Excellent",
        checklist=[],
        violations=[],
        assigned_officer_id=assigned_officer_id,
        verified_by=assigned_officer_id,
        verified_at=datetime.datetime.now(datetime.timezone.utc),
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    return record


def test_enforcement_officer_dashboard_excludes_out_of_scope_records(db):
    unique = uuid.uuid4().hex[:8]
    own_record = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"own-{unique}")
    other_officer_id = uuid.UUID("3de83c79-46ff-434f-ab28-ffce4184b284")  # seniorinspector@dp.com
    other_record = _make_record(db, region="Delhi", assigned_officer_id=other_officer_id, unique=f"other-{unique}")
    db.commit()

    inspector = db.get(Profile, _INSPECTOR_ID)
    body = get_dashboard(db=db, current_user=inspector)

    scoped_ids = {r["id"] for r in body["recentScans"]}
    assert str(own_record.id) in scoped_ids
    assert str(other_record.id) not in scoped_ids

    # National-scope roles see the same aggregate the mock/legacy frontend
    # convention promised: unscoped for National.
    admin = db.get(Profile, uuid.UUID("f3f4faa5-2f96-4f04-b161-934a8032ba20"))  # oldofficer@dp.com — Admin, National
    admin_body = get_dashboard(db=db, current_user=admin)
    admin_scoped_ids = {r["id"] for r in admin_body["recentScans"]}
    assert str(own_record.id) in admin_scoped_ids
    assert str(other_record.id) in admin_scoped_ids
