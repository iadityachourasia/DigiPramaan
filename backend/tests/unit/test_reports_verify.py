"""
Unit tests for GET /verify/reports/{id} (F-003 fix, 2026-09-19) — calls
`verify_report` directly (a plain function; its `Depends(...)` defaults
don't matter outside the real ASGI app), mocking the DB and S3 client so
these run with no real Postgres/B2. Confirms `authenticity` now reflects
a real re-hash of the stored object, not just the DB row's own status.
"""

from __future__ import annotations

import hashlib
import uuid
from unittest.mock import MagicMock, patch

from app.api.v1.reports import verify_report


class _FakeReport:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.status = kwargs.get("status", "COMPLETED")
        self.pdf_storage_key = kwargs.get("pdf_storage_key", "reports/example.pdf")
        self.pdf_sha256 = kwargs.get("pdf_sha256")
        self.generated_at = kwargs.get("generated_at", None)
        self.frozen_snapshot = kwargs.get(
            "frozen_snapshot", {"inspection": {"inspectionId": "LM-000001"}}
        )


def _settings() -> MagicMock:
    settings = MagicMock()
    settings.s3_bucket = "test-bucket"
    return settings


def test_matching_hash_is_valid() -> None:
    pdf_bytes = b"%PDF-1.4 fake pdf content"
    real_hash = hashlib.sha256(pdf_bytes).hexdigest()
    report = _FakeReport(pdf_sha256=real_hash)
    db = MagicMock()
    db.get.return_value = report

    s3_client = MagicMock()
    s3_client.get_object.return_value = {"Body": MagicMock(read=MagicMock(return_value=pdf_bytes))}

    with patch("app.api.v1.reports.get_s3_client", return_value=s3_client):
        result = verify_report(str(report.id), db=db, settings=_settings())

    assert result["authenticity"] == "VALID"
    assert result["pdfSha256"] == real_hash
    assert result["inspectionId"] == "LM-000001"


def test_mismatched_hash_is_tampered_not_valid() -> None:
    """The literal proof of the fix: a stored object that no longer
    matches its recorded hash must never come back VALID just because the
    DB row says status=COMPLETED."""
    stored_bytes = b"these bytes were swapped after generation"
    report = _FakeReport(pdf_sha256=hashlib.sha256(b"original bytes").hexdigest())
    db = MagicMock()
    db.get.return_value = report

    s3_client = MagicMock()
    s3_client.get_object.return_value = {"Body": MagicMock(read=MagicMock(return_value=stored_bytes))}

    with patch("app.api.v1.reports.get_s3_client", return_value=s3_client):
        result = verify_report(str(report.id), db=db, settings=_settings())

    assert result["authenticity"] == "TAMPERED"


def test_storage_unreachable_is_never_valid() -> None:
    report = _FakeReport(pdf_sha256="abc123")
    db = MagicMock()
    db.get.return_value = report

    s3_client = MagicMock()
    s3_client.get_object.side_effect = RuntimeError("connection refused")

    with patch("app.api.v1.reports.get_s3_client", return_value=s3_client):
        result = verify_report(str(report.id), db=db, settings=_settings())

    assert result["authenticity"] == "TAMPERED"


def test_missing_report_is_not_found() -> None:
    db = MagicMock()
    db.get.return_value = None
    result = verify_report(str(uuid.uuid4()), db=db, settings=_settings())
    assert result["authenticity"] == "NOT_FOUND"
    assert result["pdfSha256"] is None


def test_incomplete_report_is_not_found() -> None:
    report = _FakeReport(status="GENERATING", pdf_storage_key=None)
    db = MagicMock()
    db.get.return_value = report
    result = verify_report(str(report.id), db=db, settings=_settings())
    assert result["authenticity"] == "NOT_FOUND"


def test_malformed_id_is_not_found_not_a_500() -> None:
    db = MagicMock()
    result = verify_report("not-a-uuid", db=db, settings=_settings())
    assert result["authenticity"] == "NOT_FOUND"
