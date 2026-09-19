"""
R2/F-003 — integration proof that report generation genuinely round-trips
through a REAL, locally running Next.js dev server's
`POST /api/internal/render-report` (no mock/MockTransport), backed by a
real disposable Postgres and a real disposable MinIO, and that the
officer named "verified by" in the resulting snapshot is the record's
real verifier, not whoever triggered generation (the exact bug this
phase fixed in `snapshot.py::_build_officer_verification`).

Requires, started before running this file:
  - the disposable Postgres from backend/docker-compose.yml (+ its local
    port-remap override) — same "TEST_DATABASE_URL == DATABASE_URL"
    discipline as every other integration test in this suite.
  - the disposable MinIO container.
  - the real Next.js dev server (`npm run dev`, port 3000) with
    INTERNAL_RENDER_SECRET set in .env.local to the SAME value this test
    passes via `Settings.internal_render_secret` below.

Skips cleanly (not a failure) if TEST_DATABASE_URL isn't configured, or
if the dev server isn't actually reachable — this is real infrastructure
this test cannot start itself.
"""

from __future__ import annotations

import io
import uuid

import httpx
import pytest
from PIL import Image
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.object_storage import ensure_bucket_exists, get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, Profile, Report, ScanSession
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.jobs.reports import generate_report_job
from app.services.extraction.schema import ComplianceEvidenceBundle, ExtractedField, StructuredExtraction

pytestmark = pytest.mark.integration

RUN_ID = uuid.uuid4().hex[:8]
_INTERNAL_RENDER_SECRET = "local-dev-render-secret-test-only"
_FRONTEND_BASE_URL = "http://127.0.0.1:3000"


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "profiles/scan_sessions/evidence_images/compliance_records/reports rows."
        )
    if settings.test_database_url != settings.database_url:
        pytest.skip(
            "TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else — "
            "SessionLocal always connects via DATABASE_URL."
        )


def _skip_unless_dev_server_up() -> None:
    try:
        httpx.get(_FRONTEND_BASE_URL, timeout=3.0)
    except httpx.HTTPError:
        pytest.skip(
            f"Requires a real Next.js dev server running at {_FRONTEND_BASE_URL} "
            "(npm run dev) with INTERNAL_RENDER_SECRET set in .env.local."
        )


def _real_jpeg_bytes(color: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), color=color).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _field(value: str | None, not_detected: bool = False) -> ExtractedField:
    return ExtractedField(value=value, not_detected=not_detected, evidence=[], extraction_confidence=0.0)


def _bundle() -> dict:
    empty = _field(None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=_field("Acme Foods Pvt Ltd"), packer=empty, importer=empty,
        brand_owner_or_marketer=empty, generic_name=_field("Widget"), net_quantity=_field("1 kg"),
        manufacture_or_import_date=_field("01/2026"),
        mrp=_field("Rs 100 inclusive of all taxes"), consumer_care=_field("1800-000-0000"),
        country_of_origin=empty, address=empty, quantity_unit_expression=empty,
        language_detected="English",
    )
    return ComplianceEvidenceBundle(structured_extraction=extraction, rule_results=[]).model_dump()


def _pipeline_settings(real: Settings) -> Settings:
    base = dict(
        database_url=real.database_url,
        test_database_url=real.test_database_url,
        supabase_url=real.supabase_url,
        supabase_anon_key=real.supabase_anon_key,
        supabase_jwt_secret=real.supabase_jwt_secret,
        s3_endpoint_url="http://localhost:9000",
        s3_access_key="minioadmin",
        s3_secret_key="minioadmin",
        s3_bucket=f"digipramaan-report-roundtrip-{RUN_ID}",
        s3_region="us-east-1",
        s3_use_ssl=False,
        s3_auto_create_bucket=True,
        frontend_base_url=_FRONTEND_BASE_URL,
        internal_render_secret=_INTERNAL_RENDER_SECRET,
    )
    return Settings(**base)  # type: ignore[arg-type]


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    _skip_unless_dev_server_up()

    settings = _pipeline_settings(get_settings())
    ensure_bucket_exists(settings)
    s3_client = get_s3_client(settings)

    db = SessionLocal()
    generator_id = uuid.uuid4()
    verifier_id = uuid.uuid4()
    db.execute(auth_users.insert().values(id=generator_id))
    db.execute(auth_users.insert().values(id=verifier_id))

    generator = Profile(
        id=generator_id, username=f"render-generator-{RUN_ID}",
        email=f"render-generator-{RUN_ID}@example.invalid",
        full_name="Generating Officer", role="Enforcement Officer", region="Maharashtra",
        jurisdiction_level="State", jurisdiction_name="Maharashtra",
    )
    verifier = Profile(
        id=verifier_id, username=f"render-verifier-{RUN_ID}",
        email=f"render-verifier-{RUN_ID}@example.invalid",
        full_name="Verifying Officer Real Name", role="Admin", region="Maharashtra",
        jurisdiction_level="State", jurisdiction_name="Maharashtra",
    )
    db.add_all([generator, verifier])
    db.flush()

    scan_session = ScanSession(
        created_by=generator_id, category="Packaged Food", region="Maharashtra",
        source="Officer-Scanned", stages=[], status="completed",
    )
    db.add(scan_session)
    db.flush()

    front_key = f"evidence/{scan_session.id}/front-{RUN_ID}.jpg"
    s3_client.put_object(
        Bucket=settings.s3_bucket, Key=front_key, Body=_real_jpeg_bytes((200, 50, 50)),
        ContentType="image/jpeg",
    )
    evidence_image = EvidenceImage(
        scan_session_id=scan_session.id, angle="front", storage_key=front_key,
        content_hash="fakehash", quality_result={"overall_verdict": "PASS"},
    )
    db.add(evidence_image)
    db.flush()

    record = ComplianceRecord(
        scan_session_id=scan_session.id,
        product_name_observed="Render Roundtrip Test Product",
        manufacturer_name_observed="Acme Foods Pvt Ltd",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Verified",
        compliance_status="Compliant",
        assigned_officer_id=generator_id,
        verified_by=verifier_id,
        checklist=[{"fieldId": "manufacturerDetails", "passed": True, "value": "Acme Foods Pvt Ltd"}],
        violations=[],
        evidence_bundle=_bundle(),
    )
    db.add(record)
    db.flush()
    scan_session.record_id = record.id
    record_id = record.id

    report = Report(
        compliance_record_id=record_id, frozen_snapshot={}, generated_by=generator_id,
        status="PENDING", report_format_version="2.0",
    )
    db.add(report)
    db.flush()
    report_id = report.id
    db.commit()

    try:
        yield settings, report_id, record_id, scan_session.id, verifier_id, generator_id
    finally:
        db.rollback()
        r = db.get(Report, report_id)
        if r is not None:
            db.delete(r)
        db.flush()
        ss = db.get(ScanSession, scan_session.id)
        if ss is not None:
            ss.record_id = None
        db.flush()
        ei = db.get(EvidenceImage, evidence_image.id)
        if ei is not None:
            db.delete(ei)
        db.flush()
        rec = db.get(ComplianceRecord, record_id)
        if rec is not None:
            rec.scan_session_id = None
            db.flush()
            db.delete(rec)
        db.flush()
        ss = db.get(ScanSession, scan_session.id)
        if ss is not None:
            db.delete(ss)
        db.flush()
        for pid in (generator_id, verifier_id):
            p = db.get(Profile, pid)
            if p is not None:
                db.delete(p)
        db.flush()
        db.execute(text("DELETE FROM auth.users WHERE id = ANY(:ids)"), {"ids": [generator_id, verifier_id]})
        db.commit()
        db.close()


def test_report_renders_via_real_nextjs_route_and_names_the_real_verifier(fixture) -> None:
    settings, report_id, record_id, scan_session_id, verifier_id, generator_id = fixture

    from unittest.mock import patch

    with patch("app.jobs.reports.get_settings", return_value=settings), \
         patch("app.services.reports.images.get_s3_client", return_value=get_s3_client(settings)):
        generate_report_job(report_id)

    db = SessionLocal()
    try:
        report = db.get(Report, report_id)
        assert report is not None
        assert report.status == "COMPLETED", f"status={report.status} error={report.error_message}"
        assert report.pdf_storage_key is not None
        assert report.docx_storage_key is not None
        assert report.pdf_sha256 is not None
        assert report.docx_sha256 is not None

        snapshot = report.frozen_snapshot
        assert snapshot["officerVerification"]["verifiedByName"] == "Verifying Officer Real Name"
        assert snapshot["officerVerification"]["verifiedByName"] != "Generating Officer"
        assert snapshot["reportMetadata"]["generatedByName"] == "Generating Officer"

        s3_client = get_s3_client(settings)
        pdf_obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.pdf_storage_key)
        pdf_bytes = pdf_obj["Body"].read()
        docx_obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.docx_storage_key)
        docx_bytes = docx_obj["Body"].read()

        assert pdf_bytes.startswith(b"%PDF")
        assert len(pdf_bytes) > 1000
        assert docx_bytes[:2] == b"PK"  # DOCX is a zip container
        assert len(docx_bytes) > 1000
    finally:
        db.close()
