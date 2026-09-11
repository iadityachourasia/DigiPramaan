"""
Unit tests for app/services/reports/images.py's report_image_workspace() —
pure PIL/temp-directory logic, no real B2 (the S3 client is monkeypatched).
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from app.services.reports.images import (
    CROP_MAX_DIMENSION_PX,
    ORIGINAL_MAX_DIMENSION_PX,
    report_image_workspace,
)
from app.services.reports.schema import (
    ImageReference,
    IntegrityBlock,
    OfficerVerification,
    OverallAssessment,
    ProductInfo,
    ReportMetadata,
    ReportSnapshotV2,
    ViolationDetail,
)
from app.services.reports.schema import InspectionInfo


def _jpeg_bytes(width: int, height: int) -> bytes:
    img = Image.new("RGB", (width, height), (200, 50, 50))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def _minimal_snapshot(original_images, violations=None) -> ReportSnapshotV2:
    return ReportSnapshotV2(
        report_metadata=ReportMetadata(
            report_id="r1", reference_code="ref-1", generated_at="2026-01-01T00:00:00Z",
            generated_by_name="Officer", generated_by_role="Enforcement Officer", generated_by_region="MH",
        ),
        inspection=InspectionInfo(inspection_id="i1", scanned_at=None, source="Officer-Scanned", region="MH", category="Packaged Food"),
        product=ProductInfo(product_name="Test Product", generic_name=None, category=None, net_quantity=None, mrp=None, country_of_origin=None),
        overall_assessment=OverallAssessment(compliance_status="Compliant", compliance_score=100, compliance_band="Excellent", verification_status="Verified"),
        original_images=original_images,
        violations=violations or [],
        officer_verification=OfficerVerification(
            verified_by_name="Officer", verified_by_role="Enforcement Officer", verified_by_region="MH",
            verified_at=None, final_status="Compliant",
        ),
        integrity=IntegrityBlock(
            report_id="r1", inspection_id="i1", generated_at="2026-01-01T00:00:00Z",
            generated_by_name="Officer", report_format_version="2.0", rule_set_version="v1",
            verify_url="http://localhost/verify/report/r1",
        ),
    )


class _FakeRecord:
    scan_session_id = uuid.uuid4()


class _FakeSettings:
    s3_bucket = "test-bucket"


def _fake_evidence_row(image_id, angle, storage_key):
    row = MagicMock()
    row.id = image_id
    row.angle = angle
    row.storage_key = storage_key
    return row


def _db_with_rows(rows):
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = rows
    return db


def test_resize_preserves_aspect_ratio_and_caps_long_edge():
    image_id = uuid.uuid4()
    ref = ImageReference(image_id=str(image_id), angle="front", content_hash="h", uploaded_at=None, quality_verdict="PASS")
    snapshot = _minimal_snapshot([ref])
    record = _FakeRecord()
    db = _db_with_rows([_fake_evidence_row(image_id, "front", "evidence/x/front.jpg")])

    with patch("app.services.reports.images._fetch_bytes", return_value=_jpeg_bytes(3200, 1600)):
        with report_image_workspace(record, snapshot, db, _FakeSettings()) as paths:
            assert paths.front is not None
            assert paths.front.exists()
            with Image.open(paths.front) as out:
                assert max(out.size) <= ORIGINAL_MAX_DIMENSION_PX
                # 2:1 aspect ratio preserved within integer-rounding tolerance
                assert abs(out.size[0] / out.size[1] - 2.0) < 0.02
            assert paths.original_dimensions[str(image_id)] == (3200, 1600)
        # cleaned up after the `with` block exits successfully
        assert not paths.front.exists()


def test_temp_dir_removed_on_exception():
    image_id = uuid.uuid4()
    ref = ImageReference(image_id=str(image_id), angle="front", content_hash="h", uploaded_at=None, quality_verdict="PASS")
    snapshot = _minimal_snapshot([ref])
    record = _FakeRecord()
    db = _db_with_rows([_fake_evidence_row(image_id, "front", "evidence/x/front.jpg")])

    captured_dir = {}
    with pytest.raises(RuntimeError):
        with patch("app.services.reports.images._fetch_bytes", return_value=_jpeg_bytes(800, 600)):
            with report_image_workspace(record, snapshot, db, _FakeSettings()) as paths:
                captured_dir["path"] = paths.front.parent
                raise RuntimeError("simulated renderer failure")
    assert not captured_dir["path"].exists()


def test_missing_b2_object_degrades_to_omission_not_failure():
    image_id = uuid.uuid4()
    ref = ImageReference(image_id=str(image_id), angle="front", content_hash="h", uploaded_at=None, quality_verdict="PASS")
    snapshot = _minimal_snapshot([ref])
    record = _FakeRecord()
    db = _db_with_rows([_fake_evidence_row(image_id, "front", "evidence/x/missing.jpg")])

    with patch("app.services.reports.images._fetch_bytes", side_effect=Exception("404 Not Found")):
        with report_image_workspace(record, snapshot, db, _FakeSettings()) as paths:
            assert paths.front is None
            assert paths.original_dimensions == {}


def test_violation_crop_capped_and_padded():
    image_id = uuid.uuid4()
    ref = ImageReference(image_id=str(image_id), angle="side_pdp", content_hash="h", uploaded_at=None, quality_verdict="PASS")
    violation = ViolationDetail(
        rule_id="rule_6e_mrp", category="MRP Non-Compliance", legal_basis="Rule 6(e)",
        detail="MRP absent", result="FAIL", original_image=ref, bbox=[100, 100, 2000, 1200],
        crop_image_ref="rule_6e_mrp",
    )
    snapshot = _minimal_snapshot([ref], violations=[violation])
    record = _FakeRecord()
    db = _db_with_rows([_fake_evidence_row(image_id, "side_pdp", "evidence/x/side.jpg")])

    with patch("app.services.reports.images._fetch_bytes", return_value=_jpeg_bytes(3200, 1600)):
        with report_image_workspace(record, snapshot, db, _FakeSettings()) as paths:
            crop_path = paths.violation_crops["rule_6e_mrp"]
            assert crop_path.exists()
            with Image.open(crop_path) as crop:
                assert max(crop.size) <= CROP_MAX_DIMENSION_PX
