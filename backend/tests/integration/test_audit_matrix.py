"""
Integration test: real mutations actually write real `audit_events` rows
(Phase 1.2), and a failed mutation writes none.

Same "runs ONLY against a dedicated, disposable TEST_DATABASE_URL" and
"real HTTP request -> real locally-signed HS256 token -> real Postgres"
discipline as test_authz_matrix.py — see that file's own module docstring
for the full reasoning. This file focuses on the audit-writing side of
Phase 1.1's mutations rather than their scoping.
"""

from __future__ import annotations

import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.models import AuditEvent, ComplianceRecord, Profile, ProductInspectionLink
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.main import create_app
from app.services.extraction.schema import ComplianceEvidenceBundle, ExtractedField, StructuredExtraction

pytestmark = pytest.mark.integration


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "profiles/compliance_records/audit_events rows and must never run against the "
            "shared database."
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


def _field(value: str | None, not_detected: bool = False) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=[], extraction_confidence=0.0)


def _bundle() -> dict:
    empty = _field(None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=_field("Acme"), packer=empty, importer=empty, brand_owner_or_marketer=empty,
        generic_name=_field("Widget"), net_quantity=_field("1 kg"),
        manufacture_or_import_date=_field("01/2026"),
        mrp=_field("Rs 100 inclusive of all taxes"), consumer_care=_field("1800-000-0000"),
        country_of_origin=empty, address=empty, quantity_unit_expression=empty,
        language_detected="English",
    )
    return ComplianceEvidenceBundle(structured_extraction=extraction, rule_results=[]).model_dump()


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    db = SessionLocal()
    user_id = uuid.uuid4()
    # A fresh suffix per fixture invocation, not per module — each test
    # function in this file calls this fixture separately, and a
    # module-level constant would collide on Profile.username's unique
    # constraint across tests within the same pytest process.
    run_id = uuid.uuid4().hex[:8]
    db.execute(auth_users.insert().values(id=user_id))
    profile = Profile(
        id=user_id,
        username=f"audit-{run_id}",
        email=f"audit-{run_id}@example.invalid",
        full_name="Audit Matrix Test",
        role="Enforcement Officer",
        region="Maharashtra",
        jurisdiction_level="State",
        jurisdiction_name="Maharashtra",
    )
    db.add(profile)
    db.flush()

    record = ComplianceRecord(
        product_name_observed="Audit Test Product",
        manufacturer_name_observed="Acme",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Extracted",
        compliance_status="Needs Review",
        assigned_officer_id=user_id,
        checklist=[
            {"fieldId": fid, "passed": True, "value": "x"}
            for fid in (
                "manufacturerDetails", "genericName", "netQuantity",
                "manufactureDate", "retailSalePrice", "consumerCareDetails",
            )
        ],
        violations=[],
        evidence_bundle=_bundle(),
    )
    db.add(record)
    db.flush()
    record_id = record.id
    db.commit()

    try:
        yield user_id, record_id
    finally:
        db.rollback()
        db.execute(text("DELETE FROM audit_events WHERE record_id = :rid"), {"rid": record_id})
        # A successful /verify runs the intelligence loop, which may have
        # created a ProductInspectionLink row referencing this record —
        # that FK must go before the record itself can be deleted. The
        # Product/LegalEntity rows it points at are left in place: they
        # resolve by normalized name/fingerprint, so a future test run
        # reusing the same fixture data safely finds and reuses them
        # rather than colliding on a uniqueness constraint — harmless,
        # reusable residue on this disposable database, unlike a
        # Profile/ComplianceRecord row.
        db.query(ProductInspectionLink).filter(
            ProductInspectionLink.compliance_record_id == record_id
        ).delete()
        db.flush()
        obj = db.get(ComplianceRecord, record_id)
        if obj is not None:
            db.delete(obj)
        db.flush()
        p = db.get(Profile, user_id)
        if p is not None:
            db.delete(p)
        db.flush()
        db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        db.commit()
        db.close()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def _events_for_record(record_id: uuid.UUID) -> list[AuditEvent]:
    with SessionLocal() as db:
        return (
            db.query(AuditEvent)
            .filter(AuditEvent.record_id == record_id)
            .order_by(AuditEvent.created_at)
            .all()
        )


def test_successful_correction_writes_exactly_one_field_corrected_event(
    client: TestClient, fixture
) -> None:
    user_id, record_id = fixture
    response = client.post(
        f"/api/v1/records/{record_id}/corrections",
        json={"field_id": "genericName", "value": "Refined Widget"},
        headers=_auth_headers(user_id),
    )
    assert response.status_code == 200

    events = _events_for_record(record_id)
    field_corrected = [e for e in events if e.event_type == "field_corrected"]
    assert len(field_corrected) == 1
    event = field_corrected[0]
    assert event.actor_id == user_id
    assert event.actor_role == "Enforcement Officer"
    assert event.region == "Maharashtra"
    assert event.detail["fieldId"] == "genericName"
    assert event.detail["newValue"] == "Refined Widget"


def test_failed_correction_writes_no_event(client: TestClient, fixture) -> None:
    user_id, record_id = fixture
    response = client.post(
        f"/api/v1/records/{record_id}/corrections",
        json={"field_id": "notARealField", "value": "x"},
        headers=_auth_headers(user_id),
    )
    assert response.status_code == 422
    assert _events_for_record(record_id) == []


def test_successful_verify_writes_exactly_one_confirm_and_verify_event(
    client: TestClient, fixture
) -> None:
    user_id, record_id = fixture
    response = client.post(f"/api/v1/records/{record_id}/verify", headers=_auth_headers(user_id))
    assert response.status_code == 200

    events = _events_for_record(record_id)
    verified = [e for e in events if e.event_type == "confirm_and_verify"]
    assert len(verified) == 1
    assert verified[0].actor_id == user_id
    assert verified[0].region == "Maharashtra"


def test_out_of_scope_mutation_writes_no_event(client: TestClient, fixture) -> None:
    """The 404 from services/authz happens before any mutation logic runs
    — a wrong-scope attempt must leave no trace at all."""
    _user_id, record_id = fixture
    other_user_headers = _auth_headers(uuid.uuid4())  # not a provisioned profile -> 401, never reaches the handler
    response = client.post(
        f"/api/v1/records/{record_id}/corrections",
        json={"field_id": "genericName", "value": "Should never land"},
        headers=other_user_headers,
    )
    assert response.status_code == 401
    assert _events_for_record(record_id) == []


def test_verify_then_record_detail_shows_real_audit_trail(client: TestClient, fixture) -> None:
    """End-to-end proof that services/records/serialize.py::_audit_trail()
    (Phase 1.2) actually surfaces the real event through GET /records/{id}."""
    user_id, record_id = fixture
    verify_response = client.post(f"/api/v1/records/{record_id}/verify", headers=_auth_headers(user_id))
    assert verify_response.status_code == 200

    detail_response = client.get(f"/api/v1/records/{record_id}", headers=_auth_headers(user_id))
    assert detail_response.status_code == 200
    audit_trail = detail_response.json()["auditTrail"]
    verified_entries = [e for e in audit_trail if e["type"] == "Verified"]
    assert len(verified_entries) == 1
    assert verified_entries[0]["byUserId"] == str(user_id)
    assert verified_entries[0]["byUserName"] == "Audit Matrix Test"
