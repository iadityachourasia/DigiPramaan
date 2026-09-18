"""
Integration tests for GET /activity (Phase 1.4) against the real
disposable Postgres — region scoping, actor/type/date filters, the
correction-vs-note detail projection, and recordLabels/availableRegions.
Same "runs ONLY against a dedicated, disposable TEST_DATABASE_URL"
discipline as test_authz_matrix.py/test_audit_matrix.py.
"""

from __future__ import annotations

import datetime
import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.models import AuditEvent, ComplianceRecord, Profile, ScanSession
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.main import create_app

pytestmark = pytest.mark.integration


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "profiles/audit_events rows and must never run against the shared database."
        )
    if settings.test_database_url != settings.database_url:
        pytest.skip(
            "TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else."
        )


def _mint_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = int(time.time())
    claims = {"sub": str(user_id), "aud": "authenticated", "iat": now, "exp": now + 3600}
    return jwt.encode(claims, settings.supabase_jwt_secret, algorithm="HS256")


def _auth_headers(user_id: uuid.UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_mint_token(user_id)}"}


def _at(minutes_ago: int) -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes_ago)


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    db = SessionLocal()
    run_id = uuid.uuid4().hex[:8]

    state_admin_id = uuid.uuid4()
    national_admin_id = uuid.uuid4()
    eo_id = uuid.uuid4()
    db.execute(auth_users.insert().values(id=state_admin_id))
    db.execute(auth_users.insert().values(id=national_admin_id))
    db.execute(auth_users.insert().values(id=eo_id))

    state_admin = Profile(
        id=state_admin_id, username=f"activity-state-admin-{run_id}",
        email=f"activity-state-admin-{run_id}@example.invalid", full_name="State Admin",
        role="Admin", region="Maharashtra", jurisdiction_level="State", jurisdiction_name="Maharashtra",
    )
    national_admin = Profile(
        id=national_admin_id, username=f"activity-national-admin-{run_id}",
        email=f"activity-national-admin-{run_id}@example.invalid", full_name="National Admin",
        role="Admin", region=None, jurisdiction_level="National", jurisdiction_name=None,
    )
    eo = Profile(
        id=eo_id, username=f"activity-eo-{run_id}", email=f"activity-eo-{run_id}@example.invalid",
        full_name="EO No Activity Access", role="Enforcement Officer", region="Maharashtra",
        jurisdiction_level="State", jurisdiction_name="Maharashtra",
    )
    db.add_all([state_admin, national_admin, eo])
    db.flush()

    scan_session = ScanSession(
        created_by=state_admin_id, category="Packaged Food", region="Maharashtra", stages=[],
    )
    db.add(scan_session)
    db.flush()

    record = ComplianceRecord(
        scan_session_id=scan_session.id, product_name_observed="Activity Log Test Product",
        region="Maharashtra", source="Officer-Scanned",
    )
    db.add(record)
    db.flush()
    record_id = record.id
    scan_session_id = scan_session.id

    events = [
        AuditEvent(
            actor_id=state_admin_id, actor_role="Admin", event_type="field_corrected",
            record_id=record_id, region="Maharashtra",
            detail={"fieldId": "genericName", "oldValue": "A", "newValue": "B"},
            created_at=_at(40),
        ),
        AuditEvent(
            actor_id=None, actor_role=None, event_type="ocr_completed",
            record_id=None, region="Kerala", detail=None, created_at=_at(30),
        ),
        AuditEvent(
            actor_id=None, actor_role=None, event_type="scan_created",
            record_id=record_id, region="Maharashtra", detail=None, created_at=_at(20),
        ),
        AuditEvent(
            actor_id=state_admin_id, actor_role="Admin", event_type="flagged_needs_review",
            record_id=record_id, region="Maharashtra",
            detail={"note": "Escalating for a second opinion."}, created_at=_at(10),
        ),
    ]
    db.add_all(events)
    db.commit()

    try:
        yield {
            "state_admin_id": state_admin_id,
            "national_admin_id": national_admin_id,
            "eo_id": eo_id,
            "record_id": record_id,
            "scan_session_id": scan_session_id,
        }
    finally:
        db.rollback()
        db.execute(text("DELETE FROM audit_events WHERE record_id = :rid"), {"rid": record_id})
        db.execute(text("DELETE FROM audit_events WHERE region = 'Kerala' AND actor_id IS NULL AND event_type = 'ocr_completed'"))
        obj = db.get(ComplianceRecord, record_id)
        if obj is not None:
            db.delete(obj)
        db.flush()
        ss = db.get(ScanSession, scan_session_id)
        if ss is not None:
            db.delete(ss)
        db.flush()
        for pid in (state_admin_id, national_admin_id, eo_id):
            p = db.get(Profile, pid)
            if p is not None:
                db.delete(p)
        db.flush()
        db.execute(
            text("DELETE FROM auth.users WHERE id = ANY(:ids)"),
            {"ids": [state_admin_id, national_admin_id, eo_id]},
        )
        db.commit()
        db.close()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def test_enforcement_officer_forbidden(client: TestClient, fixture) -> None:
    response = client.get("/api/v1/activity", headers=_auth_headers(fixture["eo_id"]))
    assert response.status_code == 403


def test_state_admin_sees_only_own_region(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "pageSize": 50},
        headers=_auth_headers(fixture["state_admin_id"]),
    )
    assert response.status_code == 200
    body = response.json()
    regions = {row.get("region") for row in body["rows"]}
    assert regions == {"Maharashtra"}
    assert body["totalCount"] == 3  # field_corrected, scan_created, flagged_needs_review


def test_national_admin_sees_all_regions(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "pageSize": 50},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["totalCount"] == 3  # this fixture's Kerala event has no recordId, so recordId filter excludes it


def test_national_admin_available_regions_includes_kerala(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"pageSize": 50},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    assert response.status_code == 200
    assert "Kerala" in response.json()["availableRegions"]


def test_state_admin_available_regions_excludes_kerala(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"pageSize": 50},
        headers=_auth_headers(fixture["state_admin_id"]),
    )
    assert response.status_code == 200
    assert "Kerala" not in response.json()["availableRegions"]


def test_system_actor_filter_matches_null_actor_events(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "actorUserIds": ["__system"], "pageSize": 50},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["totalCount"] == 1
    assert body["rows"][0]["type"] == "scan_created"
    assert "actorUserId" not in body["rows"][0]


def test_type_filter(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "types": ["field_corrected"]},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["totalCount"] == 1
    assert body["rows"][0]["fieldId"] == "genericName"
    assert body["rows"][0]["oldValue"] == "A"
    assert body["rows"][0]["newValue"] == "B"
    assert "detail" not in body["rows"][0]


def test_note_detail_projects_as_plain_string(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "types": ["flagged_needs_review"]},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["rows"][0]["detail"] == "Escalating for a second opinion."
    assert "fieldId" not in body["rows"][0]


def test_record_labels_populated_from_current_page(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"])},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["recordLabels"][str(fixture["record_id"])] == str(fixture["scan_session_id"])


def test_actor_role_and_name_resolved(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "types": ["field_corrected"]},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    body = response.json()
    row = body["rows"][0]
    assert row["actorUserId"] == str(fixture["state_admin_id"])
    assert row["actorRole"] == "Admin"
    assert row["actorUserName"] == "State Admin"


def test_sort_newest_first_by_default(client: TestClient, fixture) -> None:
    response = client.get(
        "/api/v1/activity",
        params={"recordId": str(fixture["record_id"]), "pageSize": 50},
        headers=_auth_headers(fixture["national_admin_id"]),
    )
    body = response.json()
    timestamps = [row["createdAt"] for row in body["rows"]]
    assert timestamps == sorted(timestamps, reverse=True)
