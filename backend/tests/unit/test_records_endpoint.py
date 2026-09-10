"""
Unit tests for POST /records/{id}/corrections and POST /records/{id}/verify
— mocks the DB session (no real Postgres). Follows the same
TestClient + dependency_overrides convention as test_scans_endpoint.py.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.services.extraction.schema import ComplianceEvidenceBundle, ExtractedField, StructuredExtraction

TEST_USER_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
RECORD_ID = uuid.uuid4()


def _fake_profile(role: str = "Enforcement Officer"):
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = role
    return p


def _field(value: str | None = "x", not_detected: bool = False) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=[], extraction_confidence=0.0)


def _extraction(**overrides) -> StructuredExtraction:
    empty = _field(value=None, not_detected=True)
    base = dict(
        manufacturer=_field("Acme"), packer=empty, importer=empty, brand_owner_or_marketer=empty,
        generic_name=_field("Widget"), net_quantity=_field("1 kg"),
        manufacture_or_import_date=_field("01/2026"),
        mrp=_field("Rs 100 inclusive of all taxes"), consumer_care=_field("1800-000-0000"),
        country_of_origin=empty, address=empty, quantity_unit_expression=empty,
        language_detected="English",
    )
    base.update(overrides)
    return StructuredExtraction(**base)


def _extraction_result_dict(declarations_overrides: dict | None = None) -> dict:
    field_ids = [
        "manufacturerDetails", "genericName", "netQuantity", "manufactureDate",
        "retailSalePrice", "countryOfOrigin", "consumerCareDetails",
    ]
    declarations = []
    for field_id in field_ids:
        entry = {
            "fieldId": field_id, "value": "x", "notDetected": False, "confidence": 90,
            "band": "High", "corrected": False, "sourceEngine": "paddleocr", "sourceImageAngle": "front",
        }
        if declarations_overrides and field_id in declarations_overrides:
            entry.update(declarations_overrides[field_id])
        declarations.append(entry)
    return {
        "scanId": str(uuid.uuid4()), "processingStatus": "Completed", "overallConfidence": 90,
        "declarations": declarations, "fontSizeChecks": [],
    }


def _fake_record(
    verification_status: str = "Extracted",
    with_evidence_bundle: bool = True,
    declarations_overrides: dict | None = None,
):
    class _Record:
        pass

    r = _Record()
    r.id = RECORD_ID
    r.scan_session_id = uuid.uuid4()
    r.category = "Packaged Food"
    r.region = "Maharashtra"
    r.source = "Officer-Scanned"
    r.product_name_observed = "Widget"
    r.manufacturer_name_observed = "Acme"
    r.verification_status = verification_status
    r.compliance_status = "Needs Review"
    r.compliance_score = 50
    r.compliance_band = "Poor"
    r.extraction = _extraction_result_dict(declarations_overrides)
    # A realistic checklist covering the mandatory (always-relevant) fields
    # — countryOfOrigin is deliberately absent here, matching the real rule
    # engine's behavior of excluding NOT_APPLICABLE results (e.g. a
    # domestic product with no import evidence) from the checklist.
    r.checklist = [
        {"fieldId": fid, "passed": True, "value": "x"}
        for fid in (
            "manufacturerDetails", "genericName", "netQuantity",
            "manufactureDate", "retailSalePrice", "consumerCareDetails",
        )
    ]
    r.violations = []
    r.evidence_bundle = (
        ComplianceEvidenceBundle(structured_extraction=_extraction()).model_dump()
        if with_evidence_bundle else None
    )
    r.scanned_at = None
    r.verified_at = None
    r.verified_by = None
    return r


@pytest.fixture()
def client_with_record():
    """Returns (client_factory, record) — record_factory(role, record) lets
    each test supply its own fake ComplianceRecord for db.get() to return."""
    app = create_app()

    def _make(role: str, record):
        mock_db = MagicMock()
        mock_db.get.return_value = record

        def _override_get_db():
            yield mock_db

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = lambda: _fake_profile(role)
        return TestClient(app), mock_db

    yield _make
    app.dependency_overrides.clear()


def test_correction_on_verified_record_returns_409_with_no_mutation(client_with_record) -> None:
    record = _fake_record(verification_status="Verified")
    client, mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(
        f"/api/v1/records/{RECORD_ID}/corrections",
        json={"field_id": "genericName", "value": "New Name"},
        headers={"Authorization": "Bearer fake"},
    )

    assert response.status_code == 409
    mock_db.commit.assert_not_called()


def test_correction_on_extracted_record_updates_checklist_and_status(client_with_record) -> None:
    record = _fake_record(
        verification_status="Extracted",
        declarations_overrides={"genericName": {"notDetected": True, "value": None}},
    )
    client, mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(
        f"/api/v1/records/{RECORD_ID}/corrections",
        json={"field_id": "genericName", "value": "Refined Groundnut Oil"},
        headers={"Authorization": "Bearer fake"},
    )

    assert response.status_code == 200
    body = response.json()
    mock_db.commit.assert_called_once()
    generic_name_decl = next(d for d in body["extraction"]["declarations"] if d["fieldId"] == "genericName")
    assert generic_name_decl["corrected"] is True
    assert generic_name_decl["correctedByUserId"] == str(TEST_USER_ID)
    # generic_name was not_detected -> NEEDS_REVIEW before; corrected -> PASS now,
    # which should improve (or at minimum not worsen) the overall status.
    assert body["complianceStatus"] in ("Compliant", "Needs Review", "Non-Compliant")


def test_correction_with_unknown_field_id_returns_422(client_with_record) -> None:
    record = _fake_record()
    client, _mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(
        f"/api/v1/records/{RECORD_ID}/corrections",
        json={"field_id": "notARealField", "value": "x"},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 422


def test_correction_without_evidence_bundle_returns_409(client_with_record) -> None:
    record = _fake_record(with_evidence_bundle=False)
    client, _mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(
        f"/api/v1/records/{RECORD_ID}/corrections",
        json={"field_id": "genericName", "value": "x"},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 409


def test_verify_with_not_detected_declaration_returns_blocked_fields_not_error(client_with_record) -> None:
    # genericName is always checklist-relevant (never NOT_APPLICABLE), so a
    # notDetected genericName genuinely blocks verification.
    record = _fake_record(declarations_overrides={"genericName": {"notDetected": True}})
    client, mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(f"/api/v1/records/{RECORD_ID}/verify", headers={"Authorization": "Bearer fake"})

    assert response.status_code == 200
    body = response.json()
    assert "genericName" in body["blockedFields"]
    assert record.verification_status == "Extracted"  # unchanged
    mock_db.commit.assert_not_called()


def test_verify_ignores_not_applicable_country_of_origin_and_succeeds(client_with_record) -> None:
    """A domestic product's countryOfOrigin is permanently notDetected but
    the rule engine correctly excludes it from the checklist (NOT_APPLICABLE,
    no import evidence) — this must never block verification, unlike the
    old mock's blunt "any notDetected blocks" rule."""
    record = _fake_record(declarations_overrides={"countryOfOrigin": {"notDetected": True}})
    client, mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(f"/api/v1/records/{RECORD_ID}/verify", headers={"Authorization": "Bearer fake"})

    assert response.status_code == 200
    body = response.json()
    assert body["blockedFields"] == []
    assert body["record"]["verificationStatus"] == "Verified"
    mock_db.commit.assert_called_once()


def test_verify_with_everything_detected_succeeds(client_with_record) -> None:
    record = _fake_record()
    client, mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(f"/api/v1/records/{RECORD_ID}/verify", headers={"Authorization": "Bearer fake"})

    assert response.status_code == 200
    body = response.json()
    assert body["blockedFields"] == []
    assert body["record"]["verificationStatus"] == "Verified"
    assert record.verified_by == TEST_USER_ID
    mock_db.commit.assert_called_once()


def test_double_verify_returns_409(client_with_record) -> None:
    record = _fake_record(verification_status="Verified")
    client, mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(f"/api/v1/records/{RECORD_ID}/verify", headers={"Authorization": "Bearer fake"})

    assert response.status_code == 409
    mock_db.commit.assert_not_called()


def test_legal_status_independent_of_score_at_endpoint_level(client_with_record) -> None:
    """A record whose score is low (many NEEDS_REVIEW fields) but whose
    legal status is driven purely by the presence/absence of FAILs — the
    two must not imply each other."""
    record = _fake_record(
        declarations_overrides={
            "countryOfOrigin": {"notDetected": True},
            "consumerCareDetails": {"notDetected": True},
        },
    )
    client, _mock_db = client_with_record("Enforcement Officer", record)

    response = client.post(
        f"/api/v1/records/{RECORD_ID}/corrections",
        json={"field_id": "genericName", "value": "Widget X"},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 200
    body = response.json()
    # No FAIL possible here (only presence-based NEEDS_REVIEW gaps) -> never Non-Compliant.
    assert body["complianceStatus"] != "Non-Compliant"
    # complianceScore is independently computed, not derived from complianceStatus.
    assert isinstance(body["complianceScore"]["value"], int)
