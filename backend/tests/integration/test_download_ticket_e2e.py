"""
P2 hardening (F-010) — integration proof that the real
POST /reports/{id}/download-ticket -> GET /reports/{id}/download/{format}
round trip works end to end against a real disposable Postgres + MinIO,
through the real FastAPI app (TestClient), with NO mocking of the ticket
module itself. Confirms:
  - a real Bearer JWT can still issue a ticket and download directly
    (the existing officer-console Bearer path is unchanged);
  - the issued ticket alone (no Authorization header) downloads the
    exact same bytes;
  - an expired ticket is rejected;
  - a ticket minted for a DIFFERENT report is rejected when replayed
    against this one.
"""

from __future__ import annotations

import hashlib
import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.object_storage import ensure_bucket_exists, get_s3_client
from app.db.models import ComplianceRecord, Profile, Report
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal, get_db
from app.main import create_app
from app.services.tickets.download_ticket import issue_download_ticket

pytestmark = pytest.mark.integration

RUN_ID = uuid.uuid4().hex[:8]
_TICKET_SECRET = "integration-test-ticket-secret"


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip("Requires a dedicated, disposable TEST_DATABASE_URL.")
    if settings.test_database_url != settings.database_url:
        pytest.skip("TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else.")


def _pipeline_settings(real: Settings) -> Settings:
    return Settings(
        database_url=real.database_url,
        test_database_url=real.test_database_url,
        supabase_url=real.supabase_url,
        supabase_anon_key=real.supabase_anon_key,
        supabase_jwt_secret=real.supabase_jwt_secret,
        s3_endpoint_url="http://localhost:9000",
        s3_access_key="minioadmin",
        s3_secret_key="minioadmin",
        s3_bucket=f"digipramaan-ticket-e2e-{RUN_ID}",
        s3_region="us-east-1",
        s3_use_ssl=False,
        s3_auto_create_bucket=True,
        download_ticket_secret=_TICKET_SECRET,
        download_ticket_ttl_seconds=2,
    )  # type: ignore[arg-type]


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    settings = _pipeline_settings(get_settings())
    ensure_bucket_exists(settings)
    s3_client = get_s3_client(settings)

    pdf_bytes = b"%PDF-1.4 fake pdf for ticket e2e test"
    pdf_key = f"reports/ticket-e2e-{RUN_ID}.pdf"
    s3_client.put_object(Bucket=settings.s3_bucket, Key=pdf_key, Body=pdf_bytes, ContentType="application/pdf")

    db = SessionLocal()
    officer_id = uuid.uuid4()
    db.execute(auth_users.insert().values(id=officer_id))
    officer = Profile(
        id=officer_id, username=f"ticket-e2e-{RUN_ID}", email=f"ticket-e2e-{RUN_ID}@example.invalid",
        full_name="Ticket E2E Officer", role="Enforcement Officer", region="Maharashtra",
        jurisdiction_level="State", jurisdiction_name="Maharashtra",
    )
    db.add(officer)
    db.flush()

    record = ComplianceRecord(
        product_name_observed="Ticket E2E Product", manufacturer_name_observed="Acme",
        category="Packaged Food", region="Maharashtra", source="Officer-Scanned",
        verification_status="Verified", compliance_status="Compliant",
        assigned_officer_id=officer_id, verified_by=officer_id,
        checklist=[], violations=[], evidence_bundle={"structured_extraction": {}, "rule_results": []},
    )
    db.add(record)
    db.flush()

    other_record = ComplianceRecord(
        product_name_observed="Ticket E2E Other Product", manufacturer_name_observed="Acme",
        category="Packaged Food", region="Maharashtra", source="Officer-Scanned",
        verification_status="Verified", compliance_status="Compliant",
        assigned_officer_id=officer_id, verified_by=officer_id,
        checklist=[], violations=[], evidence_bundle={"structured_extraction": {}, "rule_results": []},
    )
    db.add(other_record)
    db.flush()

    report = Report(
        compliance_record_id=record.id, frozen_snapshot={"reportMetadata": {}, "inspection": {}},
        generated_by=officer_id, status="COMPLETED", report_format_version="2.0",
        pdf_storage_key=pdf_key, pdf_sha256=hashlib.sha256(pdf_bytes).hexdigest(),
    )
    db.add(report)
    db.flush()

    other_report = Report(
        compliance_record_id=other_record.id, frozen_snapshot={"reportMetadata": {}, "inspection": {}},
        generated_by=officer_id, status="COMPLETED", report_format_version="2.0",
    )
    db.add(other_report)
    db.flush()

    report_id, other_report_id, record_id, other_record_id = report.id, other_report.id, record.id, other_record.id
    db.commit()

    try:
        yield settings, report_id, other_report_id, officer_id, pdf_bytes
    finally:
        db.rollback()
        for r_id in (report_id, other_report_id):
            r = db.get(Report, r_id)
            if r is not None:
                db.delete(r)
        db.flush()
        for rec_id in (record_id, other_record_id):
            rec = db.get(ComplianceRecord, rec_id)
            if rec is not None:
                db.delete(rec)
        db.flush()
        p = db.get(Profile, officer_id)
        if p is not None:
            db.delete(p)
        db.flush()
        db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": officer_id})
        db.commit()
        db.close()
        try:
            s3_client.delete_object(Bucket=settings.s3_bucket, Key=pdf_key)
        except Exception:  # noqa: BLE001 - best-effort cleanup
            pass


def _mint_bearer_headers(officer_id: uuid.UUID, settings) -> dict[str, str]:
    now = int(time.time())
    claims = {
        "sub": str(officer_id), "aud": "authenticated",
        "iss": f"{settings.resolved_supabase_url}/auth/v1",
        "iat": now, "exp": now + 3600,
    }
    token = jwt.encode(claims, settings.supabase_jwt_secret, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def _client(settings, officer):
    app = create_app()

    def _override_get_db():
        with SessionLocal() as db:
            yield db

    def _override_get_settings():
        return settings

    from app.core.config import get_settings as real_get_settings
    from app.api.deps.auth import get_current_user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[real_get_settings] = _override_get_settings
    # get_current_user is overridden for the TICKET-ISSUANCE route (a
    # normal protected route using the standard dependency) — the
    # DOWNLOAD route itself uses get_current_user_or_ticket, a SEPARATE
    # dependency that does its own real JWT verification and is
    # deliberately NOT overridden, so a real Bearer token is still needed
    # to exercise that path (see _mint_bearer_headers).
    app.dependency_overrides[get_current_user] = lambda: officer
    return TestClient(app)


def test_bearer_token_still_issues_and_downloads_directly(fixture) -> None:
    settings, report_id, _other_report_id, officer_id, pdf_bytes = fixture
    officer = SimpleProfile(officer_id)
    client = _client(settings, officer)
    bearer_headers = _mint_bearer_headers(officer_id, settings)

    issue_response = client.post(f"/api/v1/reports/{report_id}/download-ticket")
    assert issue_response.status_code == 200
    ticket = issue_response.json()["ticket"]
    assert "expiresAt" in issue_response.json()

    download_response = client.get(f"/api/v1/reports/{report_id}/download/pdf", headers=bearer_headers)
    assert download_response.status_code == 200
    assert download_response.content == pdf_bytes

    ticket_only_response = client.get(f"/api/v1/reports/{report_id}/download/pdf?ticket={ticket}")
    assert ticket_only_response.status_code == 200
    assert ticket_only_response.content == pdf_bytes


def test_ticket_alone_downloads_without_any_auth_header(fixture) -> None:
    settings, report_id, _other_report_id, officer_id, pdf_bytes = fixture
    officer = SimpleProfile(officer_id)
    issuing_client = _client(settings, officer)
    issue_response = issuing_client.post(f"/api/v1/reports/{report_id}/download-ticket")
    ticket = issue_response.json()["ticket"]

    # A fresh client with NO get_current_user override at all — proves the
    # ticket alone is sufficient, no Bearer/session dependency involved.
    app = create_app()

    def _override_get_db():
        with SessionLocal() as db:
            yield db

    from app.core.config import get_settings as real_get_settings

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[real_get_settings] = lambda: settings
    anon_client = TestClient(app)

    response = anon_client.get(f"/api/v1/reports/{report_id}/download/pdf?ticket={ticket}")
    assert response.status_code == 200
    assert response.content == pdf_bytes


def test_expired_ticket_rejected(fixture) -> None:
    settings, report_id, _other_report_id, officer_id, _pdf_bytes = fixture
    officer = SimpleProfile(officer_id)
    client = _client(settings, officer)
    issue_response = client.post(f"/api/v1/reports/{report_id}/download-ticket")
    ticket = issue_response.json()["ticket"]

    time.sleep(settings.download_ticket_ttl_seconds + 1)

    response = client.get(f"/api/v1/reports/{report_id}/download/pdf?ticket={ticket}")
    assert response.status_code == 401


def test_ticket_for_a_different_report_rejected(fixture) -> None:
    settings, report_id, other_report_id, officer_id, _pdf_bytes = fixture
    officer = SimpleProfile(officer_id)
    client = _client(settings, officer)
    issue_response = client.post(f"/api/v1/reports/{report_id}/download-ticket")
    ticket = issue_response.json()["ticket"]

    response = client.get(f"/api/v1/reports/{other_report_id}/download/pdf?ticket={ticket}")
    assert response.status_code == 401


class SimpleProfile:
    def __init__(self, profile_id: uuid.UUID) -> None:
        self.id = profile_id
        self.role = "Enforcement Officer"
        self.jurisdiction_level = "National"
        self.region = None
