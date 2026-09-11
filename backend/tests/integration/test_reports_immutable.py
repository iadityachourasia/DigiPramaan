"""
Safe integration test for Phase 13's async, evidence-embedding reports:
real dev DB (Supabase) + real Node renderer subprocess + real B2 upload/
download. Creates its own uniquely-fingerprinted ComplianceRecord and
cleans it (and its Report row + B2 objects) up in its own fixture
teardown — never touches pre-existing demo data, same discipline as
test_intelligence_loop.py.

Generation is now async (BackgroundTasks) — this test calls
`generate_report()` with a real `BackgroundTasks()` instance (never
awaited, exactly the mobile-handoff integration test's own established
pattern) and then calls `generate_report_job()` directly, synchronously,
in place of the background task actually running.

Marked @pytest.mark.integration — excluded from the default `pytest` run.
"""

from __future__ import annotations

import datetime
import hashlib
import uuid

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.v1.reports import download_report, generate_report, retry_report_generation, verify_report
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Report
from app.db.session import SessionLocal
from app.jobs.reports import generate_report_job

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_record_ids"] = []
        session.info["created_report_ids"] = []
        yield session
        session.rollback()

        settings = get_settings()
        report_ids = session.info["created_report_ids"]
        if report_ids:
            reports = session.query(Report).filter(Report.id.in_(report_ids)).all()
            s3_client = get_s3_client(settings)
            for report in reports:
                for key in (report.pdf_storage_key, report.docx_storage_key):
                    if key:
                        try:
                            s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
                        except Exception:  # noqa: BLE001 - best-effort cleanup
                            pass
            session.query(Report).filter(Report.id.in_(report_ids)).delete(synchronize_session=False)

        record_ids = session.info["created_record_ids"]
        if record_ids:
            session.query(Report).filter(Report.compliance_record_id.in_(record_ids)).delete(
                synchronize_session=False
            )
            session.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(
                synchronize_session=False
            )
        session.commit()


def _make_verified_record(db) -> ComplianceRecord:
    unique = uuid.uuid4().hex[:10]
    record = ComplianceRecord(
        product_name_observed=f"Test Report Product {unique}",
        manufacturer_name_observed=f"Test Report Mfr {unique}",
        category="Packaged Food",
        region="Maharashtra",
        source="Officer-Scanned",
        verification_status="Verified",
        compliance_status="Compliant",
        compliance_score=100,
        compliance_band="Excellent",
        checklist=[],
        violations=[],
        evidence_bundle={"structured_extraction": {}, "rule_results": []},
        assigned_officer_id=_INSPECTOR_ID,
        verified_by=_INSPECTOR_ID,
        verified_at=datetime.datetime.now(datetime.timezone.utc),
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    return record


class _FakeProfile:
    """Only the attributes generate_report()/build_report_snapshot()/
    apply_officer_scope() read."""

    id = _INSPECTOR_ID
    full_name = "Field Inspector"
    role = "Enforcement Officer"
    region = "Maharashtra"
    jurisdiction_level = "State"


def _generate_and_run(db, record) -> uuid.UUID:
    """generate_report() only inserts a PENDING row and schedules a
    BackgroundTask — calling the endpoint function directly (not through
    a real ASGI request) never actually runs that task, so this runs
    generate_report_job() synchronously in its place, exactly like the
    mobile-handoff integration test runs run_pipeline() directly."""
    summary = generate_report(
        record.id, background_tasks=BackgroundTasks(), db=db, current_user=_FakeProfile()
    )
    report_id = uuid.UUID(summary["id"])
    db.info["created_report_ids"].append(report_id)
    db.commit()
    generate_report_job(report_id)
    db.expire_all()
    return report_id


def test_report_generation_and_immutable_redownload(db):
    settings = get_settings()
    record = _make_verified_record(db)
    db.commit()

    report_id = _generate_and_run(db, record)
    report = db.get(Report, report_id)
    assert report.status == "COMPLETED"
    assert report.pdf_sha256 and len(report.pdf_sha256) == 64
    assert report.docx_sha256 and len(report.docx_sha256) == 64

    pdf_response_1 = download_report(report_id, "pdf", db=db, settings=settings, current_user=_FakeProfile())
    pdf_response_2 = download_report(report_id, "pdf", db=db, settings=settings, current_user=_FakeProfile())
    docx_response_1 = download_report(report_id, "docx", db=db, settings=settings, current_user=_FakeProfile())
    docx_response_2 = download_report(report_id, "docx", db=db, settings=settings, current_user=_FakeProfile())

    pdf_hash_1 = hashlib.sha256(pdf_response_1.body).hexdigest()
    pdf_hash_2 = hashlib.sha256(pdf_response_2.body).hexdigest()
    docx_hash_1 = hashlib.sha256(docx_response_1.body).hexdigest()
    docx_hash_2 = hashlib.sha256(docx_response_2.body).hexdigest()

    assert pdf_hash_1 == pdf_hash_2, "re-download must be byte-identical to the first download"
    assert docx_hash_1 == docx_hash_2, "re-download must be byte-identical to the first download"
    assert pdf_hash_1 == report.pdf_sha256
    assert docx_hash_1 == report.docx_sha256

    # And the stored B2 object itself matches what was served — proving the
    # download path reads the stored artifact rather than regenerating.
    s3_client = get_s3_client(settings)
    stored_pdf = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.pdf_storage_key)["Body"].read()
    stored_docx = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.docx_storage_key)["Body"].read()
    assert hashlib.sha256(stored_pdf).hexdigest() == pdf_hash_1
    assert hashlib.sha256(stored_docx).hexdigest() == docx_hash_1

    # frozen_snapshot matches ReportSnapshotV2's shape.
    assert report.frozen_snapshot["reportMetadata"]["reportId"] == str(report_id)
    assert report.frozen_snapshot["inspection"]["inspectionId"]
    assert report.frozen_snapshot["officerVerification"]["finalStatus"] == "Compliant"

    # Public verification endpoint reflects the completed report, and
    # never leaks anything beyond the documented 5 fields.
    verification = verify_report(str(report_id), db=db)
    assert verification["authenticity"] == "VALID"
    assert verification["pdfSha256"] == pdf_hash_1
    assert set(verification.keys()) == {"reportId", "inspectionId", "generatedAt", "status", "pdfSha256", "authenticity"}


def test_generation_refused_for_unverified_record(db):
    record = _make_verified_record(db)
    record.verification_status = "Extracted"
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        generate_report(record.id, background_tasks=BackgroundTasks(), db=db, current_user=_FakeProfile())
    assert exc_info.value.status_code == 409


def test_download_unknown_format_rejected(db):
    settings = get_settings()
    record = _make_verified_record(db)
    db.commit()
    report_id = _generate_and_run(db, record)

    with pytest.raises(HTTPException) as exc_info:
        download_report(report_id, "exe", db=db, settings=settings, current_user=_FakeProfile())
    assert exc_info.value.status_code == 422


def test_failed_generation_never_looks_like_a_real_artifact(db, monkeypatch):
    settings = get_settings()
    record = _make_verified_record(db)
    db.commit()

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated renderer failure")

    monkeypatch.setattr("app.jobs.reports.render_via_subprocess", _boom)

    summary = generate_report(
        record.id, background_tasks=BackgroundTasks(), db=db, current_user=_FakeProfile()
    )
    report_id = uuid.UUID(summary["id"])
    db.info["created_report_ids"].append(report_id)
    db.commit()
    generate_report_job(report_id)
    db.expire_all()

    report = db.get(Report, report_id)
    assert report.status == "FAILED"
    assert report.pdf_storage_key is None
    assert report.docx_storage_key is None
    assert "simulated renderer failure" in report.error_message

    with pytest.raises(HTTPException) as exc_info:
        download_report(report_id, "pdf", db=db, settings=settings, current_user=_FakeProfile())
    assert exc_info.value.status_code == 404

    verification = verify_report(str(report_id), db=db)
    assert verification["authenticity"] == "NOT_FOUND"


def test_retry_reaches_completed_on_the_same_report_row(db, monkeypatch):
    record = _make_verified_record(db)
    db.commit()

    call_count = {"n": 0}
    real_render = None

    def _fail_once(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("simulated transient failure")
        return real_render(*args, **kwargs)

    from app.jobs import reports as reports_job_module

    real_render = reports_job_module.render_via_subprocess
    monkeypatch.setattr(reports_job_module, "render_via_subprocess", _fail_once)

    summary = generate_report(
        record.id, background_tasks=BackgroundTasks(), db=db, current_user=_FakeProfile()
    )
    report_id = uuid.UUID(summary["id"])
    db.info["created_report_ids"].append(report_id)
    db.commit()
    generate_report_job(report_id)
    db.expire_all()
    assert db.get(Report, report_id).status == "FAILED"

    retry_summary = retry_report_generation(
        report_id, background_tasks=BackgroundTasks(), db=db, current_user=_FakeProfile()
    )
    assert retry_summary["id"] == str(report_id)
    generate_report_job(report_id)
    db.expire_all()

    report = db.get(Report, report_id)
    assert report.id == report_id, "retry must reuse the same Report row, never create a new one"
    assert report.status == "COMPLETED"
    assert report.pdf_storage_key is not None
