"""
Integration tests for Phase 1.3's records contract work: the unified
response shape (corrections/verify/resolutions/retry-enrichment now all
return the full to_frontend_record() shape, not the old thin
`_record_response()` subset), the real archive endpoint, and the real
manual Needs Review flag/clear endpoint (with its own `record_review_flags`
table). Same "runs ONLY against a dedicated, disposable TEST_DATABASE_URL"
discipline as test_authz_matrix.py/test_audit_matrix.py — see those files'
own module docstrings for the full reasoning.
"""

from __future__ import annotations

import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.models import ComplianceRecord, Profile, ProductInspectionLink
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
    officer_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    run_id = uuid.uuid4().hex[:8]
    db.execute(auth_users.insert().values(id=officer_id))
    db.execute(auth_users.insert().values(id=admin_id))
    officer = Profile(
        id=officer_id, username=f"workflow-eo-{run_id}", email=f"workflow-eo-{run_id}@example.invalid",
        full_name="Workflow EO", role="Enforcement Officer", region="Maharashtra",
        jurisdiction_level="State", jurisdiction_name="Maharashtra",
    )
    admin = Profile(
        id=admin_id, username=f"workflow-admin-{run_id}", email=f"workflow-admin-{run_id}@example.invalid",
        full_name="Workflow Admin", role="Admin", region="Maharashtra",
        jurisdiction_level="National", jurisdiction_name=None,
    )
    db.add_all([officer, admin])
    db.flush()

    record = ComplianceRecord(
        product_name_observed="Workflow Test Product",
        manufacturer_name_observed="Acme",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Extracted",
        compliance_status="Needs Review",
        assigned_officer_id=officer_id,
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
        yield officer_id, admin_id, record_id
    finally:
        db.rollback()
        db.execute(text("DELETE FROM record_review_flags WHERE record_id = :rid"), {"rid": record_id})
        db.execute(text("DELETE FROM audit_events WHERE record_id = :rid"), {"rid": record_id})
        db.query(ProductInspectionLink).filter(
            ProductInspectionLink.compliance_record_id == record_id
        ).delete()
        db.flush()
        obj = db.get(ComplianceRecord, record_id)
        if obj is not None:
            db.delete(obj)
        db.flush()
        for pid in (officer_id, admin_id):
            p = db.get(Profile, pid)
            if p is not None:
                db.delete(p)
        db.flush()
        db.execute(text("DELETE FROM auth.users WHERE id = ANY(:ids)"), {"ids": [officer_id, admin_id]})
        db.commit()
        db.close()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


# --- Unified response shape -------------------------------------------------

def test_correction_response_has_full_frontend_shape(client: TestClient, fixture) -> None:
    officer_id, _admin_id, record_id = fixture
    response = client.post(
        f"/api/v1/records/{record_id}/corrections",
        json={"field_id": "genericName", "value": "Refined Widget"},
        headers=_auth_headers(officer_id),
    )
    assert response.status_code == 200
    body = response.json()
    for key in ("thumbnail", "capturedImages", "auditTrail", "needsReviewFlag", "archived"):
        assert key in body, f"missing {key} — corrections must return the full ComplianceRecord shape"


def test_verify_response_record_has_full_frontend_shape(client: TestClient, fixture) -> None:
    officer_id, _admin_id, record_id = fixture
    response = client.post(f"/api/v1/records/{record_id}/verify", headers=_auth_headers(officer_id))
    assert response.status_code == 200
    record = response.json()["record"]
    for key in ("thumbnail", "capturedImages", "auditTrail", "needsReviewFlag", "archived"):
        assert key in record


# --- POST /records/{id}/archive ---------------------------------------------

def test_archive_sets_archived_and_excludes_from_default_list(client: TestClient, fixture) -> None:
    _officer_id, admin_id, record_id = fixture

    response = client.post(f"/api/v1/records/{record_id}/archive", headers=_auth_headers(admin_id))
    assert response.status_code == 200
    assert response.json()["archived"] is True

    listing = client.get("/api/v1/records", headers=_auth_headers(admin_id))
    ids = {row["id"] for row in listing.json()["rows"]}
    assert str(record_id) not in ids

    listing_included = client.get(
        "/api/v1/records", params={"includeArchived": "true"}, headers=_auth_headers(admin_id)
    )
    ids_included = {row["id"] for row in listing_included.json()["rows"]}
    assert str(record_id) in ids_included


def test_archive_forbidden_for_enforcement_officer(client: TestClient, fixture) -> None:
    officer_id, _admin_id, record_id = fixture
    response = client.post(f"/api/v1/records/{record_id}/archive", headers=_auth_headers(officer_id))
    assert response.status_code == 403


# --- POST /records/{id}/review-flag -----------------------------------------

def test_review_flag_set_then_clear_round_trip(client: TestClient, fixture) -> None:
    officer_id, _admin_id, record_id = fixture

    set_response = client.post(
        f"/api/v1/records/{record_id}/review-flag",
        json={"flag": True, "note": "Escalating for a second opinion."},
        headers=_auth_headers(officer_id),
    )
    assert set_response.status_code == 200
    set_body = set_response.json()
    assert set_body["needsReviewFlag"] is True
    assert set_body["needsReviewByUserId"] == str(officer_id)
    assert set_body["needsReviewNote"] == "Escalating for a second opinion."

    detail = client.get(f"/api/v1/records/{record_id}", headers=_auth_headers(officer_id))
    assert detail.json()["needsReviewFlag"] is True

    clear_response = client.post(
        f"/api/v1/records/{record_id}/review-flag",
        json={"flag": False},
        headers=_auth_headers(officer_id),
    )
    assert clear_response.status_code == 200
    # The checklist itself is all-passing in this fixture, so once the
    # manual flag is cleared the computed signal goes back to False too.
    assert clear_response.json()["needsReviewFlag"] is False
    assert "needsReviewByUserId" not in clear_response.json()


def test_review_flag_set_is_idempotent_single_active_row(client: TestClient, fixture) -> None:
    officer_id, _admin_id, record_id = fixture
    for _ in range(2):
        response = client.post(
            f"/api/v1/records/{record_id}/review-flag",
            json={"flag": True},
            headers=_auth_headers(officer_id),
        )
        assert response.status_code == 200

    with SessionLocal() as db:
        count = db.execute(
            text("SELECT count(*) FROM record_review_flags WHERE record_id = :rid AND status = 'ACTIVE'"),
            {"rid": record_id},
        ).scalar_one()
    assert count == 1


# --- POST /records/bulk/review-flag -----------------------------------------

def test_bulk_review_flag_flags_visible_record(client: TestClient, fixture) -> None:
    _officer_id, admin_id, record_id = fixture

    response = client.post(
        "/api/v1/records/bulk/review-flag",
        json={"recordIds": [str(record_id)], "flag": True},
        headers=_auth_headers(admin_id),
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["updated"]) == 1
    assert body["updated"][0]["needsReviewFlag"] is True
    assert body["skipped"] == []


def test_bulk_review_flag_is_atomic_one_inaccessible_id_fails_the_whole_batch(
    client: TestClient, fixture
) -> None:
    """Phase 1.1 correction — the bulk endpoint's chosen contract is atomic
    (all-or-nothing), not partial-success: a batch containing one
    out-of-scope/nonexistent id must fail the ENTIRE request and leave the
    visible record's flag untouched, never a partial 41-of-50 apply."""
    _officer_id, admin_id, record_id = fixture
    bogus_id = uuid.uuid4()

    response = client.post(
        "/api/v1/records/bulk/review-flag",
        json={"recordIds": [str(record_id), str(bogus_id)], "flag": True},
        headers=_auth_headers(admin_id),
    )
    assert response.status_code == 404

    detail = client.get(f"/api/v1/records/{record_id}", headers=_auth_headers(admin_id))
    assert detail.json()["needsReviewFlag"] is False
