"""
Safe integration test for Phase 5's immutable reports: real dev DB (Supabase)
+ real Node renderer subprocess + real B2 upload/download. Creates its own
uniquely-fingerprinted ComplianceRecord and cleans it (and its Report row +
B2 objects) up in its own fixture teardown — never touches pre-existing
demo data, same discipline as test_intelligence_loop.py.

Marked @pytest.mark.integration — excluded from the default `pytest` run.
Calls the route functions directly (not over HTTP) — the same style every
other integration test in this suite uses (e.g. test_intelligence_loop.py
calling run_post_verification_loop() directly) — no real Supabase JWT is
needed since these are plain Python function calls with a real Profile.
"""

from __future__ import annotations

import datetime
import hashlib
import uuid

import pytest

from app.api.v1.reports import download_report, generate_report
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Report
from app.db.session import SessionLocal

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
    """Only the attributes generate_report()/build_report_document()/
    apply_officer_scope() read."""

    id = _INSPECTOR_ID
    full_name = "Field Inspector"
    role = "Enforcement Officer"
    region = "Maharashtra"
    jurisdiction_level = "State"


def test_report_generation_and_immutable_redownload(db):
    settings = get_settings()
    record = _make_verified_record(db)
    db.commit()

    summary = generate_report(record.id, db=db, settings=settings, current_user=_FakeProfile())
    db.info["created_report_ids"].append(uuid.UUID(summary["id"]))
    assert summary["formats"] == ["pdf", "docx"]

    report_id = uuid.UUID(summary["id"])

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

    # And the stored B2 object itself matches what was served — proving the
    # download path reads the stored artifact rather than regenerating.
    report = db.get(Report, report_id)
    s3_client = get_s3_client(settings)
    stored_pdf = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.pdf_storage_key)["Body"].read()
    stored_docx = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.docx_storage_key)["Body"].read()
    assert hashlib.sha256(stored_pdf).hexdigest() == pdf_hash_1
    assert hashlib.sha256(stored_docx).hexdigest() == docx_hash_1

    # frozen_snapshot matches the ReportDocument shape the Node renderer consumed.
    assert report.frozen_snapshot["totalRecords"] == 1
    assert report.frozen_snapshot["records"][0]["recordId"] == str(record.id)
    assert report.frozen_snapshot["attribution"]["kind"] == "verifier"


def test_generation_refused_for_unverified_record(db):
    settings = get_settings()
    record = _make_verified_record(db)
    record.verification_status = "Extracted"
    db.commit()

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        generate_report(record.id, db=db, settings=settings, current_user=_FakeProfile())
    assert exc_info.value.status_code == 409


def test_download_unknown_format_rejected(db):
    settings = get_settings()
    record = _make_verified_record(db)
    db.commit()
    summary = generate_report(record.id, db=db, settings=settings, current_user=_FakeProfile())
    db.info["created_report_ids"].append(uuid.UUID(summary["id"]))

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        download_report(
            uuid.UUID(summary["id"]), "exe", db=db, settings=settings, current_user=_FakeProfile()
        )
    assert exc_info.value.status_code == 422
