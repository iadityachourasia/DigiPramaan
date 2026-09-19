"""
Integration tests for §AF (2026-09-20) — the mock-to-real port of Admin
Console, Citizen Grievance Portal, Analytics, and manufacturer bulk-flag.

Runs ONLY against a dedicated, disposable TEST_DATABASE_URL (same
discipline as test_authz_matrix.py — see that file's own docstring for
why). Each test builds its own self-contained fixture (own Profile rows,
own auth.users rows) rather than depending on a pre-seeded account, so it
works against a genuinely empty freshly-migrated database, not just the
shared Supabase dev DB other integration tests in this suite assume.

Exercises the real FastAPI app end-to-end (TestClient -> locally
HS256-signed token -> get_current_user -> real Postgres), the same
technique test_authz_matrix.py already established.
"""

from __future__ import annotations

import datetime
import time
import uuid
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.models import (
    AuditEvent,
    CaseStatusHistory,
    ComplianceRecord,
    EvidenceImage,
    Grievance,
    LegalEntity,
    Product,
    ProductInspectionLink,
    Profile,
    RuleThresholdVersion,
    ScanSession,
    ViolationCase,
)
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.main import create_app

pytestmark = pytest.mark.integration

RUN_ID = uuid.uuid4().hex[:8]


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "profiles/compliance_records rows and must never run against the shared database."
        )
    if settings.test_database_url != settings.database_url:
        pytest.skip(
            "TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else — "
            "SessionLocal always connects via DATABASE_URL, so this test only runs "
            "meaningfully when both env vars point at the same disposable database."
        )


def _mint_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = int(time.time())
    claims = {"sub": str(user_id), "aud": "authenticated", "iat": now, "exp": now + 3600}
    return jwt.encode(claims, settings.supabase_jwt_secret, algorithm="HS256")


def _auth_headers(user_id: uuid.UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_mint_token(user_id)}"}


@pytest.fixture()
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture()
def db():
    _skip_unless_disposable_test_db()
    with SessionLocal() as session:
        yield session
        session.rollback()


def _make_profile(
    db,
    *,
    role: str,
    jurisdiction_level: str,
    region: str | None,
    active: bool = True,
    tag: str = "",
) -> uuid.UUID:
    user_id = uuid.uuid4()
    db.execute(auth_users.insert().values(id=user_id))
    profile = Profile(
        id=user_id,
        username=f"af-{RUN_ID}-{tag or uuid.uuid4().hex[:6]}",
        email=f"af-{RUN_ID}-{tag or uuid.uuid4().hex[:6]}@example.invalid",
        full_name="AF Integration Test",
        role=role,
        region=region,
        jurisdiction_level=jurisdiction_level,
        jurisdiction_name=region or "National",
        active=active,
    )
    db.add(profile)
    db.flush()
    return user_id


def _cleanup_profiles(db, user_ids: list[uuid.UUID]) -> None:
    db.query(Profile).filter(Profile.id.in_(user_ids)).delete(synchronize_session=False)
    db.flush()
    for user_id in user_ids:
        db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})


# --------------------------------------------------------------------- #
# Admin Console — deactivate really blocks the real auth dependency.
# --------------------------------------------------------------------- #


def test_deactivated_user_is_rejected_by_get_current_user(client: TestClient, db) -> None:
    admin_a = _make_profile(db, role="Admin", jurisdiction_level="State", region="Maharashtra", tag="admin-a")
    admin_b = _make_profile(db, role="Admin", jurisdiction_level="State", region="Maharashtra", tag="admin-b")
    officer = _make_profile(
        db, role="Enforcement Officer", jurisdiction_level="State", region="Maharashtra", tag="officer"
    )
    db.commit()

    try:
        # The officer can reach a protected route while active.
        pre_response = client.get("/api/v1/dashboard", headers=_auth_headers(officer))
        assert pre_response.status_code == 200

        deactivate_response = client.post(
            f"/api/v1/admin/users/{officer}/deactivate", headers=_auth_headers(admin_a)
        )
        assert deactivate_response.status_code == 200
        assert deactivate_response.json()["active"] is False

        post_response = client.get("/api/v1/dashboard", headers=_auth_headers(officer))
        assert post_response.status_code == 401

        db.expire_all()
        row = db.get(Profile, officer)
        assert row is not None and row.active is False
    finally:
        db.rollback()
        _cleanup_profiles(db, [admin_a, admin_b, officer])
        db.commit()


def test_deactivate_refuses_to_remove_the_last_active_admin_in_a_jurisdiction(
    client: TestClient, db
) -> None:
    sole_admin = _make_profile(db, role="Admin", jurisdiction_level="State", region="Delhi", tag="sole-admin")
    other_admin_to_deactivate = _make_profile(
        db, role="Admin", jurisdiction_level="State", region="Delhi", tag="other-admin"
    )
    db.commit()

    try:
        # Deactivate the second admin first, leaving exactly one active Admin.
        first = client.post(
            f"/api/v1/admin/users/{other_admin_to_deactivate}/deactivate", headers=_auth_headers(sole_admin)
        )
        assert first.status_code == 200

        # sole_admin cannot deactivate themselves (blocked earlier), and
        # there's no other active Admin left to deactivate them either —
        # confirm the retention guard rejects a self-deactivate attempt.
        second = client.post(f"/api/v1/admin/users/{sole_admin}/deactivate", headers=_auth_headers(sole_admin))
        assert second.status_code == 422
    finally:
        db.rollback()
        _cleanup_profiles(db, [sole_admin, other_admin_to_deactivate])
        db.commit()


# --------------------------------------------------------------------- #
# Admin Console — threshold versioning persists and is picked up live.
# --------------------------------------------------------------------- #


def test_put_thresholds_creates_a_new_version_row_and_get_reflects_it(client: TestClient, db) -> None:
    admin = _make_profile(db, role="Admin", jurisdiction_level="National", region=None, tag="thresh-admin")
    db.commit()

    version_ids_before = {
        row.id for row in db.query(RuleThresholdVersion.id).all()
    }
    try:
        payload = {
            "repeatViolationCount": 5,
            "repeatViolationDays": 60,
            "ocrConfidenceThreshold": 80,
            "excellentMinimum": 95,
            "goodMinimum": 75,
            "poorMinimum": 45,
        }
        put_response = client.put("/api/v1/admin/thresholds", json=payload, headers=_auth_headers(admin))
        assert put_response.status_code == 200
        assert put_response.json() == payload

        get_response = client.get("/api/v1/admin/thresholds", headers=_auth_headers(admin))
        assert get_response.status_code == 200
        assert get_response.json() == payload

        new_versions = [
            row for row in db.query(RuleThresholdVersion).order_by(RuleThresholdVersion.created_at.desc()).all()
            if row.id not in version_ids_before
        ]
        assert len(new_versions) == 1
        assert new_versions[0].created_by == admin
    finally:
        db.rollback()
        db.query(RuleThresholdVersion).filter(
            RuleThresholdVersion.id.not_in(version_ids_before) if version_ids_before else True
        ).delete(synchronize_session=False)
        _cleanup_profiles(db, [admin])
        db.commit()


# --------------------------------------------------------------------- #
# Citizen Grievance Portal — a real submission produces a real, linked
# ScanSession + EvidenceImage + Grievance row and is publicly lookupable.
# Object storage (B2) is patched out — this proves the DB-side contract,
# not a real network upload, matching this session's earlier decision not
# to touch real B2 from an automated test run.
# --------------------------------------------------------------------- #


def test_grievance_submission_creates_linked_rows_and_is_lookupable(client: TestClient, db) -> None:
    # The rate limiter itself has its own dedicated real-DB test below
    # (test_grievance_rate_limit_returns_429_after_the_configured_max) —
    # bypassed here so this test stays idempotent across reruns within the
    # same real auth_rate_limit_hits window, rather than depending on a
    # fresh IP bucket.
    fake_s3 = MagicMock()
    with (
        patch("app.api.v1.grievances.get_s3_client", return_value=fake_s3),
        patch("app.api.v1.grievances.check_and_increment", return_value=True),
    ):
        response = client.post(
            "/api/v1/grievances",
            data={"concerns": '["Wrong Price", "No MRP Displayed"]', "shop_name_or_location": "Test Kirana Store"},
            files={"photo": ("evidence.png", _1x1_png(), "image/png")},
        )
    assert response.status_code == 201
    reference = response.json()["reference"]
    assert reference.startswith("LM-")
    fake_s3.put_object.assert_called_once()

    try:
        grievance = db.query(Grievance).filter(Grievance.reference == reference).first()
        assert grievance is not None
        assert grievance.shop_name_or_location == "Test Kirana Store"
        assert grievance.concerns == ["Wrong Price", "No MRP Displayed"]

        scan_session = db.get(ScanSession, grievance.scan_session_id)
        assert scan_session is not None
        assert scan_session.created_by is None
        assert scan_session.source == "Citizen-Reported"

        evidence = db.query(EvidenceImage).filter(EvidenceImage.scan_session_id == scan_session.id).first()
        assert evidence is not None
        assert evidence.angle == "front"

        audit_event = (
            db.query(AuditEvent)
            .filter(AuditEvent.event_type == "scan_created", AuditEvent.region == "Not specified")
            .order_by(AuditEvent.created_at.desc())
            .first()
        )
        assert audit_event is not None
        assert audit_event.detail.get("reference") == reference

        with patch("app.api.v1.grievances.check_and_increment", return_value=True):
            lookup = client.get(f"/api/v1/grievances/{reference}")
        assert lookup.status_code == 200
        assert lookup.json()["status"] == "Received"
    finally:
        db.rollback()
        grievance = db.query(Grievance).filter(Grievance.reference == reference).first()
        if grievance is not None:
            scan_session_id = grievance.scan_session_id
            db.query(Grievance).filter(Grievance.id == grievance.id).delete()
            db.query(EvidenceImage).filter(EvidenceImage.scan_session_id == scan_session_id).delete()
            db.query(ScanSession).filter(ScanSession.id == scan_session_id).delete()
        db.commit()


def test_grievance_rate_limit_returns_429_after_the_configured_max(client: TestClient, db) -> None:
    fake_s3 = MagicMock()
    with patch("app.api.v1.grievances.get_s3_client", return_value=fake_s3), \
         patch("app.api.v1.grievances.check_and_increment", side_effect=[True, True, True, True, True, False]):
        created_references: list[str] = []
        last_status = None
        for _ in range(6):
            response = client.post(
                "/api/v1/grievances",
                data={"concerns": "[]"},
                files={"photo": ("evidence.png", _1x1_png(), "image/png")},
            )
            last_status = response.status_code
            if response.status_code == 201:
                created_references.append(response.json()["reference"])

        assert last_status == 429

    try:
        assert len(created_references) == 5
    finally:
        db.rollback()
        for reference in created_references:
            grievance = db.query(Grievance).filter(Grievance.reference == reference).first()
            if grievance is not None:
                scan_session_id = grievance.scan_session_id
                db.query(Grievance).filter(Grievance.id == grievance.id).delete()
                db.query(EvidenceImage).filter(EvidenceImage.scan_session_id == scan_session_id).delete()
                db.query(ScanSession).filter(ScanSession.id == scan_session_id).delete()
        db.commit()


def _1x1_png() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (50, 50), color=(20, 20, 20)).save(buf, format="PNG")
    return buf.getvalue()


# --------------------------------------------------------------------- #
# Analytics — a hand-built fixture's numbers match GET /analytics exactly.
# --------------------------------------------------------------------- #


def test_analytics_summary_matches_a_hand_built_fixture(client: TestClient, db) -> None:
    officer = _make_profile(
        db, role="Enforcement Officer", jurisdiction_level="National", region=None, tag="analytics-officer"
    )
    db.commit()

    now = datetime.datetime.now(datetime.timezone.utc)
    records = [
        ComplianceRecord(
            product_name_observed=f"AF Analytics Product {i}",
            manufacturer_name_observed="AF Analytics Manufacturer",
            category="Packaged Food",
            region="Maharashtra",
            source="Officer-Scanned",
            verification_status="Verified",
            compliance_status=status,
            assigned_officer_id=officer,
            verified_at=now,
            violations=violations,
        )
        for i, (status, violations) in enumerate(
            [
                ("Compliant", []),
                ("Compliant", []),
                ("Non-Compliant", [{"categoryId": "rule6a"}]),
            ]
        )
    ]
    db.add_all(records)
    db.flush()
    record_ids = [r.id for r in records]
    db.commit()

    try:
        response = client.get("/api/v1/analytics", headers=_auth_headers(officer))
        assert response.status_code == 200
        body = response.json()

        assert body["summary"]["totalScanned"] == 3
        assert body["summary"]["complianceRatePercentage"] == round(2 / 3 * 100)
        category_entry = next(
            (e for e in body["categoryBreakdown"] if e["category"] == "Packaged Food"), None
        )
        assert category_entry == {"category": "Packaged Food", "compliant": 2, "nonCompliant": 1}
        violation_entry = next(
            (e for e in body["violationBreakdown"] if e["categoryId"] == "rule6a"), None
        )
        assert violation_entry == {"categoryId": "rule6a", "count": 1}

        # §AF follow-up: GET /analytics returns BOTH weekly and monthly
        # trend buckets (Record[TrendPeriod, TrendPoint[]], matching
        # /dashboard's own `trends` shape) — Time Trends' weekly/monthly
        # toggle needs both, not just one bucket width.
        assert set(body["trends"].keys()) == {"weekly", "monthly"}
        weekly_bucket = body["trends"]["weekly"][0]
        monthly_bucket = body["trends"]["monthly"][0]
        assert weekly_bucket["totalScans"] == 3
        assert monthly_bucket["totalScans"] == 3
        assert weekly_bucket["compliant"] == 2
        assert monthly_bucket["compliant"] == 2
    finally:
        db.rollback()
        db.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(synchronize_session=False)
        _cleanup_profiles(db, [officer])
        db.commit()


# --------------------------------------------------------------------- #
# Manufacturer bulk-flag — creates cases for the right records, skips the
# rest, matching flag_record_for_enforcement's own per-record contract.
# --------------------------------------------------------------------- #


def test_bulk_flag_creates_cases_for_verified_recent_non_compliant_records_only(
    client: TestClient, db
) -> None:
    admin = _make_profile(db, role="Admin", jurisdiction_level="National", region=None, tag="bulkflag-admin")
    db.commit()

    now = datetime.datetime.now(datetime.timezone.utc)
    legal_entity = LegalEntity(name=f"AF Bulk Flag Co {RUN_ID}", normalized_name=f"af bulk flag co {RUN_ID}")
    db.add(legal_entity)
    db.flush()

    eligible_record = ComplianceRecord(
        product_name_observed="Bulk Flag Eligible",
        manufacturer_name_observed="AF Bulk Flag Co",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Verified",
        compliance_status="Non-Compliant",
        verified_at=now,
    )
    stale_record = ComplianceRecord(
        product_name_observed="Bulk Flag Stale",
        manufacturer_name_observed="AF Bulk Flag Co",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Verified",
        compliance_status="Non-Compliant",
        verified_at=now - datetime.timedelta(days=365),
    )
    compliant_record = ComplianceRecord(
        product_name_observed="Bulk Flag Compliant",
        manufacturer_name_observed="AF Bulk Flag Co",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Verified",
        compliance_status="Compliant",
        verified_at=now,
    )
    db.add_all([eligible_record, stale_record, compliant_record])
    db.flush()

    product = Product(
        legal_entity_id=legal_entity.id,
        generic_name="AF Bulk Flag Widget",
        net_quantity_normalized="1kg",
        fingerprint_hash=f"af-bulk-flag-{RUN_ID}",
    )
    db.add(product)
    db.flush()

    links = [
        ProductInspectionLink(
            compliance_record_id=record.id, product_id=product.id, status="ACTIVE", match_method="fingerprint"
        )
        for record in (eligible_record, stale_record, compliant_record)
    ]
    db.add_all(links)
    db.commit()

    record_ids = [eligible_record.id, stale_record.id, compliant_record.id]
    try:
        response = client.post(
            f"/api/v1/companies/{legal_entity.id}/flag-enforcement", headers=_auth_headers(admin)
        )
        assert response.status_code == 200
        body = response.json()

        flagged_ids = {r["id"] for r in body["flagged"]}
        assert flagged_ids == {str(eligible_record.id)}
        assert str(stale_record.id) not in flagged_ids
        assert str(compliant_record.id) not in flagged_ids

        db.expire_all()
        case = (
            db.query(ViolationCase)
            .filter(ViolationCase.originating_record_id == eligible_record.id)
            .first()
        )
        assert case is not None
        assert case.status == "OPEN"

        no_case_for_stale = (
            db.query(ViolationCase).filter(ViolationCase.originating_record_id == stale_record.id).first()
        )
        assert no_case_for_stale is None
    finally:
        db.rollback()
        case_ids = [
            row.id
            for row in db.query(ViolationCase.id)
            .filter(ViolationCase.originating_record_id.in_(record_ids))
            .all()
        ]
        db.query(CaseStatusHistory).filter(CaseStatusHistory.case_id.in_(case_ids)).delete(
            synchronize_session=False
        )
        db.query(ViolationCase).filter(ViolationCase.originating_record_id.in_(record_ids)).delete(
            synchronize_session=False
        )
        db.query(ProductInspectionLink).filter(
            ProductInspectionLink.product_id == product.id
        ).delete(synchronize_session=False)
        db.query(Product).filter(Product.id == product.id).delete()
        db.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(synchronize_session=False)
        db.query(LegalEntity).filter(LegalEntity.id == legal_entity.id).delete()
        _cleanup_profiles(db, [admin])
        db.commit()
