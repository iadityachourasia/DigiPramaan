"""
Safe integration tests for Phase 7: real evidence-image streaming (auth +
jurisdiction scope), the checklist-evidence -> real-image/bbox mapping,
server-side records search/pagination/jurisdiction-scoping, and
report-history/report-by-id jurisdiction scoping (including the
`get_report`/`download_report` gap this phase closed alongside the
already-Phase-7 `list_reports_for_record` fix).

Real dev DB (Supabase) + real Backblaze B2 upload/fetch, same
create-own-rows-and-clean-up discipline as every other integration test in
this suite (test_intelligence_loop.py, test_reports_immutable.py,
test_rule7_calibration.py). Calls route functions directly (not over HTTP),
same style used throughout — no real Supabase JWT needed.

A second jurisdiction's officer is represented by a lightweight plain
object (`_FakeOfficer`), NOT a second real `Profile` row: `Profile.id` is a
foreign key onto `auth.users`, and only one State-scoped Enforcement
Officer test account (`inspector@dp.com`, Maharashtra) exists in this
project's seed data. `apply_officer_scope()`/`get_evidence_image()` etc.
only ever read `.id`/`.role`/`.region`/`.jurisdiction_level` off
`current_user` — exactly the attributes `_FakeOfficer` provides — so this
is the same "current_user is a plain attribute-bearing object, not a real
authenticated session" convention `test_reports_immutable.py`'s
`_FakeProfile` already established for report generation.
"""

from __future__ import annotations

import datetime
import io
import uuid

import pytest
from PIL import Image

from app.api.v1.reports import download_report, generate_report, get_report, list_reports_for_record
from app.api.v1.records import list_records
from app.api.v1.scans import get_evidence_image
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, Profile, Report, ScanSession
from app.db.session import SessionLocal
from app.services.extraction.schema import (
    ComplianceEvidenceBundle,
    EvidenceRef,
    ExtractedField,
    ImageQualitySummary,
    StructuredExtraction,
)
from app.services.records.serialize import to_frontend_record
from app.services.rules.apply import reapply_rules
from fastapi import HTTPException

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com — Enforcement Officer, Maharashtra, State
_OTHER_OFFICER_ID = uuid.UUID("3de83c79-46ff-434f-ab28-ffce4184b284")  # seniorinspector@dp.com — used only as an assigned-officer id here


class _FakeOfficer:
    """A second jurisdiction's State-scoped Enforcement Officer — see
    module docstring for why this isn't a real `Profile` row."""

    def __init__(self, officer_id: uuid.UUID, region: str):
        self.id = officer_id
        self.role = "Enforcement Officer"
        self.region = region
        self.jurisdiction_level = "State"


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_record_ids"] = []
        session.info["created_scan_ids"] = []
        session.info["created_image_ids"] = []
        session.info["created_storage_keys"] = []
        session.info["created_report_ids"] = []
        yield session
        session.rollback()

        settings = get_settings()
        s3_client = get_s3_client(settings)

        report_ids = session.info["created_report_ids"]
        if report_ids:
            reports = session.query(Report).filter(Report.id.in_(report_ids)).all()
            for report in reports:
                for key in (report.pdf_storage_key, report.docx_storage_key):
                    if key:
                        try:
                            s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
                        except Exception:  # noqa: BLE001 - best-effort cleanup
                            pass
            session.query(Report).filter(Report.id.in_(report_ids)).delete(synchronize_session=False)

        storage_keys = session.info["created_storage_keys"]
        for key in storage_keys:
            try:
                s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
            except Exception:  # noqa: BLE001 - best-effort cleanup
                pass

        record_ids = session.info["created_record_ids"]
        if record_ids:
            session.query(Report).filter(Report.compliance_record_id.in_(record_ids)).delete(
                synchronize_session=False
            )
            session.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(
                synchronize_session=False
            )
        image_ids = session.info["created_image_ids"]
        if image_ids:
            session.query(EvidenceImage).filter(EvidenceImage.id.in_(image_ids)).delete(synchronize_session=False)
        scan_ids = session.info["created_scan_ids"]
        if scan_ids:
            session.query(ScanSession).filter(ScanSession.id.in_(scan_ids)).delete(synchronize_session=False)
        session.commit()


def _png_bytes(fill: tuple[int, int, int]) -> bytes:
    img = Image.new("RGB", (40, 40), fill)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _upload_image(db, *, angle: str, scan_session_id: uuid.UUID, unique: str, fill=(10, 20, 30)) -> EvidenceImage:
    settings = get_settings()
    png_bytes = _png_bytes(fill)
    storage_key = f"evidence/test-phase7-{angle}-{unique}.png"
    s3_client = get_s3_client(settings)
    s3_client.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=png_bytes)
    db.info["created_storage_keys"].append(storage_key)

    image = EvidenceImage(scan_session_id=scan_session_id, angle=angle, storage_key=storage_key)
    db.add(image)
    db.flush()
    db.info["created_image_ids"].append(image.id)
    return image


def _make_record(
    db,
    *,
    region: str,
    assigned_officer_id: uuid.UUID,
    unique: str,
    with_scan_session: bool = False,
    compliance_status: str = "Compliant",
    category: str = "Packaged Food",
    checklist: list | None = None,
    violations: list | None = None,
    verification_status: str = "Verified",
) -> ComplianceRecord:
    scan_session_id = None
    if with_scan_session:
        scan_session = ScanSession(created_by=assigned_officer_id, category=category, stages=[], status="completed")
        db.add(scan_session)
        db.flush()
        db.info["created_scan_ids"].append(scan_session.id)
        scan_session_id = scan_session.id

    record = ComplianceRecord(
        scan_session_id=scan_session_id,
        product_name_observed=f"Phase7 Test Product {unique}",
        manufacturer_name_observed=f"Phase7 Test Mfr {unique}",
        category=category,
        region=region,
        source="Officer-Scanned",
        verification_status=verification_status,
        compliance_status=compliance_status,
        compliance_score=100 if compliance_status == "Compliant" else 40,
        compliance_band="Excellent" if compliance_status == "Compliant" else "Poor",
        checklist=checklist or [],
        violations=violations or [],
        assigned_officer_id=assigned_officer_id,
        verified_by=assigned_officer_id,
        verified_at=datetime.datetime.now(datetime.timezone.utc),
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    return record, scan_session_id


def _inspector(db) -> Profile:
    return db.get(Profile, _INSPECTOR_ID)


def _search(db, current_user, **overrides) -> dict:
    """Thin wrapper around `list_records()` for direct (non-HTTP) calls:
    its `Query(default=[])` multi-value params resolve to `[]` only when
    FastAPI's own dependency injection runs them — calling the plain
    Python function directly (this suite's convention throughout) leaves
    them as the raw `Query` sentinel object unless explicitly overridden."""
    kwargs = dict(
        query=None, categories=[], regions=[], statuses=[], sources=[], manufacturers=[],
        violation_category_ids=[], date_from=None, date_to=None, brand=None, legal_entity=None,
        page=1, page_size=20,
    )
    kwargs.update(overrides)
    return list_records(db=db, current_user=current_user, **kwargs)


# --- evidence-image streaming: auth/scope --------------------------------


def test_evidence_image_streams_bytes_matching_upload_for_scoped_officer(db):
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]
    record, scan_session_id = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=unique, with_scan_session=True)
    image = _upload_image(db, angle="front", scan_session_id=scan_session_id, unique=unique, fill=(1, 2, 3))
    db.commit()

    response = get_evidence_image(image.id, db=db, settings=settings, current_user=_inspector(db))
    assert response.media_type == "image/png"

    s3_client = get_s3_client(settings)
    stored = s3_client.get_object(Bucket=settings.s3_bucket, Key=image.storage_key)["Body"].read()
    assert response.body == stored


def test_evidence_image_404_for_out_of_jurisdiction_officer(db):
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]
    record, scan_session_id = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=unique, with_scan_session=True)
    image = _upload_image(db, angle="front", scan_session_id=scan_session_id, unique=unique)
    db.commit()

    other_officer = _FakeOfficer(uuid.uuid4(), region="Delhi")
    with pytest.raises(HTTPException) as exc_info:
        get_evidence_image(image.id, db=db, settings=settings, current_user=other_officer)
    assert exc_info.value.status_code == 404


def test_evidence_image_404_for_unknown_image_id(db):
    settings = get_settings()
    with pytest.raises(HTTPException) as exc_info:
        get_evidence_image(uuid.uuid4(), db=db, settings=settings, current_user=_inspector(db))
    assert exc_info.value.status_code == 404


# --- checklist evidence -> real image + bbox mapping ----------------------


def test_rule8_checklist_evidence_maps_to_real_pdp_image_and_bbox(db):
    """Builds a real PDP image + non-degenerate bbox evidence for net
    quantity and MRP -> Rule 8 PASS, and confirms the checklist row's
    `evidence.imageId`/`bbox` correctly resolves back to a real
    `capturedImages[]` entry (the exact "View Evidence" -> ImageViewer
    highlight data path)."""
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]
    record, scan_session_id = _make_record(
        db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=unique,
        with_scan_session=True, verification_status="Extracted",
    )
    pdp_image = _upload_image(db, angle="side_pdp", scan_session_id=scan_session_id, unique=unique)
    db.flush()

    bbox = (5.0, 5.0, 35.0, 35.0)
    net_qty_field = ExtractedField(
        value="500 g", not_detected=False,
        evidence=[EvidenceRef(image_id=str(pdp_image.id), image_angle="side_pdp", provider="paddleocr", bbox=bbox, ocr_confidence=92.0)],
    )
    mrp_field = ExtractedField(
        value="Rs 100.00 incl. of all taxes", not_detected=False,
        evidence=[EvidenceRef(image_id=str(pdp_image.id), image_angle="side_pdp", provider="paddleocr", bbox=bbox, ocr_confidence=92.0)],
    )
    empty = ExtractedField(value=None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=ExtractedField(value=f"Test Mfr {unique}", not_detected=False),
        generic_name=ExtractedField(value="Test Product", not_detected=False),
        net_quantity=net_qty_field, manufacture_or_import_date=empty, mrp=mrp_field, consumer_care=empty,
    )
    image_quality_results = [ImageQualitySummary(image_id=str(pdp_image.id), angle="side_pdp", overall_verdict="PASS")]
    bundle = ComplianceEvidenceBundle(
        structured_extraction=extraction,
        ocr_blocks=[{"text": "x"} for _ in range(5)],
        image_quality_results=image_quality_results,
    )

    result = reapply_rules(record, bundle)
    record.evidence_bundle = bundle.model_dump()
    record.checklist = result["checklist"]
    record.violations = result["violations"]
    record.verification_status = "Verified"
    db.commit()

    rule8_row = next(c for c in record.checklist if c["fieldId"] == "pdpDeclarationPresence")
    assert rule8_row["passed"] is True
    assert rule8_row["evidence"]["netQuantity"]["imageId"] == str(pdp_image.id)
    assert rule8_row["evidence"]["netQuantity"]["bbox"] == list(bbox)

    frontend_record = to_frontend_record(record, db)
    captured_ids = {img["id"] for img in frontend_record["capturedImages"]}
    assert str(pdp_image.id) in captured_ids
    pdp_captured = next(img for img in frontend_record["capturedImages"] if img["id"] == str(pdp_image.id))
    assert pdp_captured["angle"] == "side_pdp"
    assert pdp_captured["url"] == f"/evidence-images/{pdp_image.id}"


def test_rule8_fail_when_pdp_image_adequate_but_field_absent(db):
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]
    record, scan_session_id = _make_record(
        db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=unique,
        with_scan_session=True, verification_status="Extracted",
    )
    pdp_image = _upload_image(db, angle="side_pdp", scan_session_id=scan_session_id, unique=unique)
    db.flush()

    mrp_field = ExtractedField(
        value="Rs 100.00 incl. of all taxes", not_detected=False,
        evidence=[EvidenceRef(image_id=str(pdp_image.id), image_angle="side_pdp", provider="paddleocr", bbox=(0.0, 0.0, 20.0, 20.0), ocr_confidence=92.0)],
    )
    empty = ExtractedField(value=None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=ExtractedField(value=f"Test Mfr {unique}", not_detected=False),
        generic_name=ExtractedField(value="Test Product", not_detected=False),
        net_quantity=empty, manufacture_or_import_date=empty, mrp=mrp_field, consumer_care=empty,
    )
    image_quality_results = [ImageQualitySummary(image_id=str(pdp_image.id), angle="side_pdp", overall_verdict="PASS")]
    bundle = ComplianceEvidenceBundle(
        structured_extraction=extraction,
        ocr_blocks=[{"text": "x"} for _ in range(5)],
        image_quality_results=image_quality_results,
    )
    result = reapply_rules(record, bundle)

    rule8_row = next(c for c in result["checklist"] if c["fieldId"] == "pdpDeclarationPresence")
    assert rule8_row["passed"] is False
    assert rule8_row["violationCategoryId"] is not None  # confirmed FAIL -> a real violation
    assert rule8_row["evidence"]["reason"] == "absent_from_required_panel"


# --- server-side search filtering + pagination ----------------------------


def test_list_records_query_filter_narrows_to_matching_product(db):
    unique = uuid.uuid4().hex[:8]
    target, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"needle-{unique}")
    other, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"haystack-{unique}")
    db.commit()

    body = _search(db, _inspector(db), query=f"needle-{unique}")
    ids = {r["id"] for r in body["rows"]}
    assert str(target.id) in ids
    assert str(other.id) not in ids
    assert body["totalCount"] == 1


def test_list_records_status_filter_narrows_results(db):
    unique = uuid.uuid4().hex[:8]
    compliant, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"compliant-{unique}", compliance_status="Compliant")
    non_compliant, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"noncompliant-{unique}", compliance_status="Non-Compliant")
    db.commit()

    body = _search(db, _inspector(db), statuses=["Non-Compliant"], query=unique)
    ids = {r["id"] for r in body["rows"]}
    assert str(non_compliant.id) in ids
    assert str(compliant.id) not in ids


def test_list_records_pagination_totalcount_matches_filtered_count(db):
    unique = uuid.uuid4().hex[:8]
    created = [_make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"page-{unique}-{i}")[0] for i in range(5)]
    db.commit()

    page1 = _search(db, _inspector(db), query=f"page-{unique}", page=1, page_size=2)
    page2 = _search(db, _inspector(db), query=f"page-{unique}", page=2, page_size=2)
    page3 = _search(db, _inspector(db), query=f"page-{unique}", page=3, page_size=2)

    assert page1["totalCount"] == 5
    assert page2["totalCount"] == 5
    assert page3["totalCount"] == 5
    assert len(page1["rows"]) == 2
    assert len(page2["rows"]) == 2
    assert len(page3["rows"]) == 1

    all_ids = {r["id"] for r in page1["rows"]} | {r["id"] for r in page2["rows"]} | {r["id"] for r in page3["rows"]}
    assert all_ids == {str(r.id) for r in created}


def test_list_records_scoped_to_officer_jurisdiction(db):
    unique = uuid.uuid4().hex[:8]
    own_record, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"scope-own-{unique}")
    other_record, _ = _make_record(db, region="Delhi", assigned_officer_id=_OTHER_OFFICER_ID, unique=f"scope-other-{unique}")
    db.commit()

    body = _search(db, _inspector(db), query=unique, page_size=200)
    ids = {r["id"] for r in body["rows"]}
    assert str(own_record.id) in ids
    assert str(other_record.id) not in ids


def test_list_records_cross_jurisdiction_officer_never_sees_other_regions_records(db):
    # assigned_officer_id is a real FK onto profiles — reuse the seeded
    # "other officer" row as the record's owner, and stand in a fake
    # State-scoped Delhi viewer with that same id (see module docstring on
    # why a fake object, not a second real Profile, represents this).
    unique = uuid.uuid4().hex[:8]
    maharashtra_record, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"cross-mh-{unique}")
    delhi_record, _ = _make_record(db, region="Delhi", assigned_officer_id=_OTHER_OFFICER_ID, unique=f"cross-dl-{unique}")
    db.commit()

    delhi_officer = _FakeOfficer(_OTHER_OFFICER_ID, region="Delhi")
    body = _search(db, delhi_officer, query=f"cross-dl-{unique}")
    ids = {r["id"] for r in body["rows"]}
    assert str(delhi_record.id) in ids

    body_wrong_query = _search(db, delhi_officer, query=f"cross-mh-{unique}")
    assert body_wrong_query["totalCount"] == 0  # region filter alone already excludes it


# --- report history + report-by-id: jurisdiction scope --------------------


class _FakeProfileForReports:
    """Same minimal-attribute convention as test_reports_immutable.py's
    `_FakeProfile` — generate_report()/apply_officer_scope() only read
    these fields."""

    def __init__(self, officer_id, region):
        self.id = officer_id
        self.full_name = "Field Inspector"
        self.role = "Enforcement Officer"
        self.region = region
        self.jurisdiction_level = "State"


def test_report_history_and_download_scoped_to_jurisdiction(db):
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]
    record, _ = _make_record(db, region="Maharashtra", assigned_officer_id=_INSPECTOR_ID, unique=f"report-{unique}")
    db.commit()

    owner = _FakeProfileForReports(_INSPECTOR_ID, "Maharashtra")
    summary = generate_report(record.id, db=db, settings=settings, current_user=owner)
    report_id = uuid.UUID(summary["id"])
    db.info["created_report_ids"].append(report_id)

    # in-scope: history, metadata, and download all succeed
    history = list_reports_for_record(record.id, db=db, current_user=owner)
    assert any(r["id"] == str(report_id) for r in history)
    meta = get_report(report_id, db=db, current_user=owner)
    assert meta["id"] == str(report_id)
    download = download_report(report_id, "pdf", db=db, settings=settings, current_user=owner)
    assert download.body

    # out-of-scope: a Delhi officer gets 404 on all three, never the artifact
    outsider = _FakeOfficer(uuid.uuid4(), region="Delhi")
    with pytest.raises(HTTPException) as exc_info:
        list_reports_for_record(record.id, db=db, current_user=outsider)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        get_report(report_id, db=db, current_user=outsider)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        download_report(report_id, "pdf", db=db, settings=settings, current_user=outsider)
    assert exc_info.value.status_code == 404
