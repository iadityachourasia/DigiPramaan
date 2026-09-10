"""
Unit tests for app/jobs/pipeline.py's stage-transition logic — mocks
PaddleOcrProvider, Gemini's structure()/GeminiOcrProvider, and B2 (via
_fetch_image_bytes) so these run in milliseconds with no live infra. The
live version of the full happy path was validated separately over real
HTTP against a real running server, real B2, real PaddleOCR, and real
Gemini; these tests isolate the two behaviors the Phase 2 spec calls out
that are awkward to force live: a provider failure leaving a stage
`failed`+retryable, and a retry actually resuming to completion.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.jobs.pipeline import initial_stages, retry_stage, run_pipeline
from app.services.extraction.schema import ExtractedField, StructuredExtraction
from app.services.ocr.provider import OcrBlock, OcrResult

SCAN_ID = uuid.uuid4()


def _fake_evidence_image(angle: str):
    class _Image:
        pass

    img = _Image()
    img.id = uuid.uuid4()
    img.angle = angle
    img.storage_key = f"evidence/{SCAN_ID}/{angle}-abc.png"
    img.quality_result = {"overall_verdict": "PASS", "reason": None}
    return img


def _fake_scan_session(stages):
    class _Session:
        pass

    s = _Session()
    s.id = SCAN_ID
    s.stages = stages
    s.status = "pending"
    s.error = None
    s.category = "Packaged Food"
    s.region = "Maharashtra"
    s.created_by = uuid.uuid4()
    s.created_at = None
    s.record_id = None
    return s


def _empty_extraction() -> StructuredExtraction:
    empty = ExtractedField(value=None, not_detected=True, evidence=[], extraction_confidence=0.0)
    return StructuredExtraction(
        manufacturer=empty, packer=empty, importer=empty, brand_owner_or_marketer=empty,
        generic_name=empty, net_quantity=empty, manufacture_or_import_date=empty, mrp=empty,
        consumer_care=empty, country_of_origin=empty, address=empty,
        quantity_unit_expression=empty, language_detected="English",
    )


@pytest.fixture()
def mock_db_session():
    """Patches SessionLocal (used as a context manager throughout
    pipeline.py) to hand back one shared mock db whose .get() always
    returns the same fake ScanSession, and captures every persisted
    stages list as `db.persisted_stages_history` for assertions."""
    stages = initial_stages(quality_summary="front: PASS; back: PASS; side_pdp: PASS")
    session = _fake_scan_session(stages)

    db = MagicMock()
    db.get.return_value = session
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
        _fake_evidence_image("front"),
        _fake_evidence_image("back"),
        _fake_evidence_image("side_pdp"),
    ]
    db.persisted_stages_history = []

    def _commit():
        db.persisted_stages_history.append(list(session.stages))

    db.commit.side_effect = _commit

    with patch("app.jobs.pipeline.SessionLocal") as mock_session_local:
        mock_session_local.return_value.__enter__.return_value = db
        yield db, session


def test_ocr_provider_failure_marks_text_extraction_failed_and_retryable(mock_db_session) -> None:
    db, session = mock_db_session

    with patch("app.jobs.pipeline._fetch_image_bytes", side_effect=RuntimeError("B2 unreachable")), \
         patch("app.jobs.pipeline.PaddleOcrProvider") as mock_provider_cls:
        mock_provider_cls.return_value.extract.side_effect = RuntimeError("B2 unreachable")
        run_pipeline(SCAN_ID)

    stage = next(s for s in session.stages if s["id"] == "textExtraction")
    assert stage["state"] == "failed"
    assert "B2 unreachable" in stage["failureReason"]
    assert session.status == "failed"

    # Downstream stages never ran.
    structuring = next(s for s in session.stages if s["id"] == "structuring")
    assert structuring["state"] == "pending"


def test_run_pipeline_never_auto_resumes_a_failed_stage(mock_db_session) -> None:
    """Re-entering run_pipeline() on a scan whose textExtraction is already
    `failed` must be a no-op — only the explicit retry endpoint may clear a
    failed stage. This is the concrete proof behind the module's own
    documented claim that BackgroundTasks never auto-resumes work."""
    db, session = mock_db_session
    stages = list(session.stages)
    for s in stages:
        if s["id"] == "textExtraction":
            s["state"] = "failed"
            s["failureReason"] = "previous crash"
    session.stages = stages

    with patch("app.jobs.pipeline.PaddleOcrProvider") as mock_provider_cls:
        run_pipeline(SCAN_ID)
        mock_provider_cls.return_value.extract.assert_not_called()

    assert next(s for s in session.stages if s["id"] == "textExtraction")["state"] == "failed"


def test_retry_stage_only_resets_and_persists_never_runs_ocr(mock_db_session) -> None:
    """Phase 3 reliability fix: retry_stage() must be fast and NEVER touch
    OCR/Gemini itself — the caller (the retry HTTP route) is responsible
    for scheduling run_pipeline() via BackgroundTasks after this returns.
    See jobs/pipeline.py's retry_stage() docstring."""
    db, session = mock_db_session
    stages = list(session.stages)
    for s in stages:
        if s["id"] == "textExtraction":
            s["state"] = "failed"
            s["failureReason"] = "previous crash"
    session.stages = stages

    with patch("app.jobs.pipeline.PaddleOcrProvider") as mock_provider_cls, \
         patch("app.jobs.pipeline.structure") as mock_structure:
        ok = retry_stage(SCAN_ID, "textExtraction")

    assert ok is True
    mock_provider_cls.return_value.extract.assert_not_called()
    mock_structure.assert_not_called()

    stage = next(s for s in session.stages if s["id"] == "textExtraction")
    assert stage["state"] == "pending"
    assert stage.get("failureReason") is None
    assert session.status == "pending"


def test_retry_stage_then_run_pipeline_completes_the_full_pipeline(mock_db_session) -> None:
    """The two-step Phase 3 flow end-to-end at the function level: reset
    (fast) followed by the caller's own run_pipeline() call (what
    BackgroundTasks does in production) still reaches completion."""
    db, session = mock_db_session
    stages = list(session.stages)
    for s in stages:
        if s["id"] == "textExtraction":
            s["state"] = "failed"
            s["failureReason"] = "previous crash"
    session.stages = stages

    ocr_result = OcrResult(
        blocks=[
            OcrBlock(image_id="img-1", text="Sample Product", confidence=98.0,
                     bbox=(0.0, 0.0, 1.0, 1.0), provider="paddleocr")
            for _ in range(4)
        ],
        provider="paddleocr",
        duration_ms=10,
    )

    with patch("app.jobs.pipeline.PaddleOcrProvider") as mock_provider_cls, \
         patch("app.jobs.pipeline._fetch_image_bytes", return_value=b"fake-bytes"), \
         patch("app.jobs.pipeline.structure", return_value=_empty_extraction()) as mock_structure:
        mock_provider_cls.return_value.extract.return_value = ocr_result

        ok = retry_stage(SCAN_ID, "textExtraction")
        assert ok is True
        run_pipeline(SCAN_ID)

    mock_structure.assert_called_once()

    final_stages = {s["id"]: s["state"] for s in session.stages}
    assert final_stages["textExtraction"] == "completed"
    assert final_stages["fallbackExtraction"] == "skipped"  # 4 blocks >= FALLBACK_MIN_BLOCKS
    assert final_stages["structuring"] == "completed"
    assert final_stages["ruleEngine"] == "completed"
    assert final_stages["complianceScore"] == "completed"
    assert final_stages["readyForVerification"] == "completed"
    assert session.status == "completed"


def test_retry_stage_returns_false_for_a_stage_that_is_not_failed(mock_db_session) -> None:
    db, session = mock_db_session  # freshly initial_stages() -> textExtraction is "pending"
    ok = retry_stage(SCAN_ID, "textExtraction")
    assert ok is False


def test_retry_stage_returns_false_for_unknown_scan() -> None:
    with patch("app.jobs.pipeline.SessionLocal") as mock_session_local:
        db = MagicMock()
        db.get.return_value = None
        mock_session_local.return_value.__enter__.return_value = db
        assert retry_stage(uuid.uuid4(), "textExtraction") is False
