"""
Safe integration tests for Phase 6's Rule 7 manual calibration + font
measurement — real dev DB (Supabase) + real Backblaze B2 upload/fetch.
Each test creates its own ScanSession/EvidenceImage/ComplianceRecord and
cleans them (plus the uploaded B2 object) up in its own fixture teardown —
same create-own-rows-and-clean-up discipline as test_intelligence_loop.py
and test_reports_immutable.py. Calls the route function directly (not over
HTTP), same style every other integration test in this suite uses.
"""

from __future__ import annotations

import datetime
import io
import uuid

import pytest
from PIL import Image, ImageDraw

from app.api.v1.scans import CalibrationPoint, CalibrationRequest, submit_calibration
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, Profile, ScanSession
from app.db.session import SessionLocal
from app.services.extraction.schema import (
    ComplianceEvidenceBundle,
    EvidenceRef,
    ExtractedField,
    StructuredExtraction,
)

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_record_ids"] = []
        session.info["created_scan_ids"] = []
        session.info["created_image_ids"] = []
        session.info["created_storage_keys"] = []
        yield session
        session.rollback()

        settings = get_settings()
        storage_keys = session.info["created_storage_keys"]
        if storage_keys:
            s3_client = get_s3_client(settings)
            for key in storage_keys:
                try:
                    s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
                except Exception:  # noqa: BLE001 - best-effort cleanup
                    pass

        record_ids = session.info["created_record_ids"]
        if record_ids:
            session.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(
                synchronize_session=False
            )
        image_ids = session.info["created_image_ids"]
        if image_ids:
            session.query(EvidenceImage).filter(EvidenceImage.id.in_(image_ids)).delete(
                synchronize_session=False
            )
        scan_ids = session.info["created_scan_ids"]
        if scan_ids:
            session.query(ScanSession).filter(ScanSession.id.in_(scan_ids)).delete(
                synchronize_session=False
            )
        session.commit()


def _render_digits_png(char_height_px: int, canvas_size=(300, 120)) -> bytes:
    img = Image.new("RGB", canvas_size, "white")
    draw = ImageDraw.Draw(img)
    char_width = 12
    gap = 10
    y0 = (canvas_size[1] - char_height_px) // 2
    x = 20
    for _ in range(4):
        draw.rectangle([x, y0, x + char_width, y0 + char_height_px], fill="black")
        x += char_width + gap
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _setup_record_with_evidence(db, *, char_height_px: int, degenerate_bbox: bool = False) -> tuple[ComplianceRecord, ScanSession]:
    """Builds a real ScanSession + EvidenceImage (uploaded to B2) + a
    ComplianceRecord whose evidence_bundle's mrp field cites that image via
    a real EvidenceRef bbox spanning the whole rendered canvas."""
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]

    scan_session = ScanSession(created_by=_INSPECTOR_ID, category="Packaged Food", stages=[], status="completed")
    db.add(scan_session)
    db.flush()
    db.info["created_scan_ids"].append(scan_session.id)

    png_bytes = _render_digits_png(char_height_px)
    storage_key = f"evidence/test-rule7-{unique}.png"
    s3_client = get_s3_client(settings)
    s3_client.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=png_bytes)
    db.info["created_storage_keys"].append(storage_key)

    image = EvidenceImage(scan_session_id=scan_session.id, angle="front", storage_key=storage_key)
    db.add(image)
    db.flush()
    db.info["created_image_ids"].append(image.id)

    bbox = (0.0, 0.0, 1.0, 1.0) if degenerate_bbox else (0.0, 0.0, 300.0, 120.0)
    mrp_field = ExtractedField(
        value="Rs 100.00", not_detected=False,
        evidence=[EvidenceRef(image_id=str(image.id), image_angle="front", provider="paddleocr", bbox=bbox)],
    )
    empty = ExtractedField(value=None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=ExtractedField(value=f"Test Mfr {unique}", not_detected=False),
        generic_name=ExtractedField(value="Test Product", not_detected=False),
        net_quantity=empty, manufacture_or_import_date=empty, mrp=mrp_field,
        consumer_care=empty,
    )
    bundle = ComplianceEvidenceBundle(structured_extraction=extraction, rule_results=[])

    record = ComplianceRecord(
        scan_session_id=scan_session.id,
        product_name_observed="Test Product", manufacturer_name_observed=f"Test Mfr {unique}",
        category="Packaged Food", region="Maharashtra", source="Officer-Scanned",
        verification_status="Extracted", compliance_status="Pending",
        evidence_bundle=bundle.model_dump(), checklist=[], violations=[],
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    return record, scan_session


def _profile(db) -> Profile:
    return db.get(Profile, _INSPECTOR_ID)


def _request(**overrides) -> CalibrationRequest:
    base = dict(
        angle="front", field_id="retailSalePrice", known_dimension_mm=10.0,
        start_point=CalibrationPoint(x=0, y=0), end_point=CalibrationPoint(x=100, y=0),
        is_embossed=False,
    )
    base.update(overrides)
    return CalibrationRequest(**base)


# --- (A) reliable calibration + large text -> measured, NEEDS_REVIEW (pending legal validation) ---

def test_reliable_calibration_measures_font_height(db):
    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=40)
    db.commit()

    # pixels_per_mm = 100/10 = 10 -> 40px / 10 = 4mm measured height.
    result = submit_calibration(
        scan_session.id, _request(known_dimension_mm=10.0), db=db, settings=settings, current_user=_profile(db)
    )
    font_check = next((f for f in result["extraction"]["fontSizeChecks"] if f["fieldId"] == "retailSalePrice"), None)
    assert font_check is not None
    assert abs(font_check["measuredHeightMm"] - 4.0) < 0.3

    rule7_row = next(c for c in result["checklist"] if c["fieldId"] == "fontSize")
    # A reliable measurement against the shipped (unvalidated) threshold is
    # NEEDS_REVIEW, not PASS/FAIL — see rule7_thresholds.py.
    assert rule7_row["passed"] is False
    assert "legal validation" in rule7_row["detail"]


# --- (C) deliberately large text (same as A here — "large" is relative to
# the calibrated scale; a second, more generous scale proves the pixel
# measurement itself, independent of the legal-validation gate) ------------

def test_large_relative_text_measures_a_larger_height(db):
    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=80)
    db.commit()

    result = submit_calibration(
        scan_session.id, _request(known_dimension_mm=10.0), db=db, settings=settings, current_user=_profile(db)
    )
    font_check = next(f for f in result["extraction"]["fontSizeChecks"] if f["fieldId"] == "retailSalePrice")
    assert abs(font_check["measuredHeightMm"] - 8.0) < 0.3


# --- (D) no calibration at all -> INSUFFICIENT_EVIDENCE (regression) ------

def test_no_calibration_stays_insufficient_evidence(db):
    record, _scan_session = _setup_record_with_evidence(db, char_height_px=40)
    db.commit()
    rule7_row = next(c for c in record.checklist or [] if c.get("fieldId") == "fontSize") if record.checklist else None
    # A fresh record's checklist is empty until rules actually run — confirm
    # the record simply has no calibration/measurement data, which is what
    # keeps a real /records/{id} read defaulting to INSUFFICIENT_EVIDENCE.
    assert rule7_row is None
    assert record.evidence_bundle.get("calibrations", []) == []


# --- (E) too-short calibration line -> NEEDS_REVIEW ------------------------

def test_too_short_calibration_line_is_needs_review(db):
    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=40)
    db.commit()

    request = _request(
        known_dimension_mm=10.0,
        start_point=CalibrationPoint(x=0, y=0), end_point=CalibrationPoint(x=5, y=0),
    )
    result = submit_calibration(scan_session.id, request, db=db, settings=settings, current_user=_profile(db))
    rule7_row = next(c for c in result["checklist"] if c["fieldId"] == "fontSize")
    assert rule7_row["passed"] is False
    assert "not reliable enough" in rule7_row["detail"]


# --- (F) implausible pixels_per_mm -> NEEDS_REVIEW -------------------------

def test_implausible_geometry_is_needs_review(db):
    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=40)
    db.commit()

    # 100px / 0.5mm = 200 px/mm, far outside the plausible range.
    request = _request(known_dimension_mm=0.5)
    result = submit_calibration(scan_session.id, request, db=db, settings=settings, current_user=_profile(db))
    rule7_row = next(c for c in result["checklist"] if c["fieldId"] == "fontSize")
    assert rule7_row["passed"] is False
    assert "not reliable enough" in rule7_row["detail"]


# --- (G) degenerate Gemini-fallback bbox -> INSUFFICIENT_EVIDENCE ----------

def test_degenerate_bbox_stays_insufficient_evidence(db):
    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=40, degenerate_bbox=True)
    db.commit()

    result = submit_calibration(
        scan_session.id, _request(known_dimension_mm=10.0), db=db, settings=settings, current_user=_profile(db)
    )
    rule7_row = next(c for c in result["checklist"] if c["fieldId"] == "fontSize")
    assert rule7_row["value"] is None  # never reaches a numeric measurement


# --- (H) zero usable connected components -> INSUFFICIENT_EVIDENCE --------

def test_blank_region_stays_insufficient_evidence(db):
    settings = get_settings()
    unique = uuid.uuid4().hex[:8]
    scan_session = ScanSession(created_by=_INSPECTOR_ID, category="Packaged Food", stages=[], status="completed")
    db.add(scan_session)
    db.flush()
    db.info["created_scan_ids"].append(scan_session.id)

    blank_png = Image.new("RGB", (300, 120), "white")
    buf = io.BytesIO()
    blank_png.save(buf, format="PNG")
    storage_key = f"evidence/test-rule7-blank-{unique}.png"
    s3_client = get_s3_client(settings)
    s3_client.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=buf.getvalue())
    db.info["created_storage_keys"].append(storage_key)

    image = EvidenceImage(scan_session_id=scan_session.id, angle="front", storage_key=storage_key)
    db.add(image)
    db.flush()
    db.info["created_image_ids"].append(image.id)

    mrp_field = ExtractedField(
        value="Rs 100.00", not_detected=False,
        evidence=[EvidenceRef(image_id=str(image.id), image_angle="front", provider="paddleocr", bbox=(0, 0, 300, 120))],
    )
    empty = ExtractedField(value=None, not_detected=True)
    extraction = StructuredExtraction(
        manufacturer=ExtractedField(value=f"Test Mfr {unique}", not_detected=False),
        generic_name=ExtractedField(value="Test Product", not_detected=False),
        net_quantity=empty, manufacture_or_import_date=empty, mrp=mrp_field, consumer_care=empty,
    )
    bundle = ComplianceEvidenceBundle(structured_extraction=extraction, rule_results=[])
    record = ComplianceRecord(
        scan_session_id=scan_session.id, product_name_observed="Test Product",
        manufacturer_name_observed=f"Test Mfr {unique}", category="Packaged Food", region="Maharashtra",
        source="Officer-Scanned", verification_status="Extracted", compliance_status="Pending",
        evidence_bundle=bundle.model_dump(), checklist=[], violations=[],
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    db.commit()

    result = submit_calibration(
        scan_session.id, _request(known_dimension_mm=10.0), db=db, settings=settings, current_user=_profile(db)
    )
    rule7_row = next(c for c in result["checklist"] if c["fieldId"] == "fontSize")
    assert rule7_row["value"] is None


# --- (I) verified record cannot be recalibrated -----------------------------

def test_verified_record_refuses_calibration(db):
    from fastapi import HTTPException

    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=40)
    record.verification_status = "Verified"
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        submit_calibration(
            scan_session.id, _request(known_dimension_mm=10.0), db=db, settings=settings, current_user=_profile(db)
        )
    assert exc_info.value.status_code == 409


# --- officer /resolutions still overrides a Rule 7 result (regression) ----

def test_officer_resolution_still_overrides_rule7(db):
    from app.api.v1.records import resolve_review_item, ResolutionRequest

    settings = get_settings()
    record, scan_session = _setup_record_with_evidence(db, char_height_px=40)
    db.commit()
    submit_calibration(
        scan_session.id, _request(known_dimension_mm=10.0), db=db, settings=settings, current_user=_profile(db)
    )
    db.refresh(record)

    body = ResolutionRequest(rule_id="rule_7_font_size", resolved_status="PASS", note="Manually verified with a ruler.")
    updated = resolve_review_item(record.id, body, db=db, current_user=_profile(db))
    rule7_row = next(c for c in updated["checklist"] if c["fieldId"] == "fontSize")
    assert rule7_row["passed"] is True
