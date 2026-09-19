"""
OP-Phase 5 — integration tests proving `run_pipeline` genuinely produces
a compliance record under `ocr_provider="openparser"`, and that a resume
after a partial run does not resubmit already-admitted images. Runs
against a real, disposable Postgres AND a real, disposable MinIO (the
first OpenParser phase that needs both — artifact writes now matter).

The OpenParser HTTP layer itself is faked via `httpx.MockTransport` (same
technique every prior OpenParser phase used) — no live network call ever.
Gemini structuring is faked the same way `tests/unit/test_pipeline.py`
already does (`patch("app.jobs.pipeline.structure", ...)`), since Phase 5
is about the OCR stage, not Gemini.

Same "runs ONLY against a dedicated, disposable TEST_DATABASE_URL"
discipline as every other integration test in this suite.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import httpx
import pytest
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.object_storage import ensure_bucket_exists, get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, OcrProviderJob, Profile, ScanSession
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.jobs.pipeline import initial_stages, run_pipeline
from app.services.extraction.schema import ExtractedField, StructuredExtraction
from app.services.ocr.openparser.pool import OpenParserKeyPool

pytestmark = pytest.mark.integration

RUN_ID = uuid.uuid4().hex[:8]

_FRONT_BYTES = b"\xff\xd8\xff\xe0" + b"fake-jpeg-front-bytes" * 10  # not a real JPEG; OCR is faked
_BACK_BYTES = b"\xff\xd8\xff\xe0" + b"fake-jpeg-back-bytes" * 10


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "scan_sessions/evidence_images/ocr_provider_jobs/compliance_records rows."
        )
    if settings.test_database_url != settings.database_url:
        pytest.skip(
            "TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else — "
            "SessionLocal always connects via DATABASE_URL."
        )


def _empty_extraction() -> StructuredExtraction:
    empty = ExtractedField(value=None, not_detected=True, evidence=[], extraction_confidence=0.0)
    return StructuredExtraction(
        manufacturer=empty, packer=empty, importer=empty, brand_owner_or_marketer=empty,
        generic_name=empty, net_quantity=empty, manufacture_or_import_date=empty, mrp=empty,
        consumer_care=empty, country_of_origin=empty, address=empty, quantity_unit_expression=empty,
    )


def _pipeline_settings(**overrides) -> Settings:
    """A real `Settings` object pointed at the disposable MinIO, used only
    via `patch("app.jobs.pipeline.get_settings", ...)` — `SessionLocal`
    (already built from real process env at import time) is untouched, so
    Postgres connectivity is exactly what the real environment provides."""
    real = get_settings()
    base = dict(
        database_url=real.database_url,
        test_database_url=real.test_database_url,
        supabase_url=real.supabase_url,
        supabase_anon_key=real.supabase_anon_key,
        supabase_jwt_secret=real.supabase_jwt_secret,
        s3_endpoint_url="http://localhost:9000",
        s3_access_key="minioadmin",
        s3_secret_key="minioadmin",
        s3_bucket=f"digipramaan-openparser-pipeline-{RUN_ID}",
        s3_region="us-east-1",
        s3_use_ssl=False,
        s3_auto_create_bucket=True,
        ocr_provider="openparser",
        openparser_api_key="eig_live_fake",
        openparser_api_key_alias="primary-a",
        openparser_tenant_alias="test-tenant",
        openparser_idempotency_secret="idem-secret",
        openparser_job_max_age_seconds=10,
        openparser_poll_min_seconds=0.01,
        openparser_submission_max_attempts=1,
    )
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _canonical_result(document_id: str) -> dict:
    # 2 elements per image so 2 images together clear FALLBACK_MIN_BLOCKS
    # (3) and never trigger a live Gemini-fallback call in these tests.
    return {
        "output_format": "openparser@1",
        "document_id": document_id,
        "pages": [
            {"number": 1, "width": 100.0, "height": 100.0, "unit": "pixel", "rotation_degrees": 0}
        ],
        "elements": [
            {
                "id": "el_1",
                "kind": "text",
                "role": "line",
                "text": "Net Quantity: 500 g",
                "locations": [{"page_number": 1, "bbox": {"left": 1, "top": 1, "right": 50, "bottom": 20}}],
                "confidence": {"score": 0.9, "scope": "recognition", "calibrated": False},
            },
            {
                "id": "el_2",
                "kind": "text",
                "role": "line",
                "text": "MRP: Rs 99 inclusive of all taxes",
                "locations": [{"page_number": 1, "bbox": {"left": 1, "top": 25, "right": 60, "bottom": 45}}],
                "confidence": {"score": 0.85, "scope": "recognition", "calibrated": False},
            },
        ],
    }


def _job_accepted_body(job_id: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": job_id, "operation": "parse", "status": "queued",
        "output_format": "openparser@1", "created_at": now, "updated_at": now,
    }


def _job_succeeded_body(job_id: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": job_id, "operation": "parse", "status": "succeeded",
        "output_format": "openparser@1", "created_at": now, "updated_at": now, "completed_at": now,
    }


def _make_handler(submit_calls: list[str]):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST" and path == "/parse/async":
            # Globally unique (not a per-test sequential counter) — job rows
            # live in a shared table with a real DB-level uniqueness
            # constraint on (provider, tenant_alias, provider_job_id); reused
            # ids across tests/scans would collide on that constraint exactly
            # like a real duplicate provider job id would.
            job_id = f"opj_{uuid.uuid4().hex[:12]}"
            submit_calls.append(job_id)
            return httpx.Response(
                202, json=_job_accepted_body(job_id), headers={"location": f"/jobs/{job_id}"}
            )
        if request.method == "GET" and path.endswith("/result"):
            job_id = path.split("/")[2]
            return httpx.Response(200, json=_canonical_result(f"doc_{job_id}"))
        if request.method == "GET" and path.startswith("/jobs/"):
            job_id = path.rsplit("/", 1)[-1]
            return httpx.Response(200, json=_job_succeeded_body(job_id))
        raise AssertionError(f"unexpected request: {request.method} {path}")

    return handler


class _Fixture:
    def __init__(self) -> None:
        self.run_id = uuid.uuid4().hex[:8]
        self.db = SessionLocal()
        self.profile_ids: list[uuid.UUID] = []
        self.scan_session_ids: list[uuid.UUID] = []
        self.evidence_image_ids: list[uuid.UUID] = []
        self.record_ids: list[uuid.UUID] = []
        self.job_ids: list[uuid.UUID] = []

    def build(self, settings: Settings) -> None:
        user_id = uuid.uuid4()
        self.db.execute(auth_users.insert().values(id=user_id))
        profile = Profile(
            id=user_id, username=f"oppipe-{self.run_id}", email=f"oppipe-{self.run_id}@example.invalid",
            full_name="OP Pipeline Test", role="Enforcement Officer", region="Maharashtra",
            jurisdiction_level="State", jurisdiction_name="Maharashtra",
        )
        self.db.add(profile)
        self.db.flush()
        self.profile_ids.append(user_id)

        self.scan_session = ScanSession(
            created_by=user_id, category="Packaged Food", region="Maharashtra",
            stages=initial_stages("Quality checks passed."), status="pending",
        )
        self.db.add(self.scan_session)
        self.db.flush()
        self.scan_session_ids.append(self.scan_session.id)

        s3_client = get_s3_client(settings)
        ensure_bucket_exists(settings)
        for angle, data in (("front", _FRONT_BYTES), ("back", _BACK_BYTES)):
            key = f"evidence/oppipe-{self.run_id}/{self.scan_session.id}/{angle}.jpg"
            s3_client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
            image = EvidenceImage(
                scan_session_id=self.scan_session.id, angle=angle, storage_key=key,
                content_hash=f"{angle}-{self.run_id}", quality_result={"width": 100, "height": 100},
            )
            self.db.add(image)
            self.db.flush()
            self.evidence_image_ids.append(image.id)

        self.db.commit()

    def refresh_jobs(self) -> list[OcrProviderJob]:
        return (
            self.db.query(OcrProviderJob)
            .filter(OcrProviderJob.scan_session_id == self.scan_session.id)
            .all()
        )

    def teardown(self) -> None:
        self.db.rollback()
        record = self.db.get(ScanSession, self.scan_session.id)
        if record is not None and record.record_id is not None:
            self.record_ids.append(record.record_id)
            # Break the circular scan_sessions.record_id <-> compliance_
            # records.scan_session_id FK before deleting either side (same
            # circularity scan.py's own module docstring documents).
            record.record_id = None
            self.db.flush()
        for model, ids in (
            (OcrProviderJob, [j.id for j in self.refresh_jobs()]),
            (ComplianceRecord, self.record_ids),
            (EvidenceImage, self.evidence_image_ids),
            (ScanSession, self.scan_session_ids),
            (Profile, self.profile_ids),
        ):
            for row_id in ids:
                obj = self.db.get(model, row_id)
                if obj is not None:
                    self.db.delete(obj)
            self.db.flush()
        for user_id in self.profile_ids:
            self.db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        self.db.commit()
        self.db.close()


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    f = _Fixture()
    try:
        yield f
    finally:
        f.teardown()


def test_openparser_mode_produces_one_record_end_to_end(fixture: _Fixture) -> None:
    settings = _pipeline_settings()
    fixture.build(settings)
    submit_calls: list[str] = []
    handler = _make_handler(submit_calls)

    def fake_pool(_settings: Settings) -> OpenParserKeyPool:
        return OpenParserKeyPool(_settings, transport=httpx.MockTransport(handler))

    with patch("app.jobs.pipeline.get_settings", return_value=settings), \
         patch("app.jobs.pipeline.OpenParserKeyPool", side_effect=fake_pool), \
         patch("app.jobs.pipeline.structure", return_value=_empty_extraction()):
        run_pipeline(fixture.scan_session.id)

    fixture.db.refresh(fixture.scan_session)
    assert fixture.scan_session.record_id is not None
    record = fixture.db.get(ComplianceRecord, fixture.scan_session.record_id)
    assert record is not None

    jobs = fixture.refresh_jobs()
    assert len(jobs) == 2
    assert all(job.local_state == "normalized" for job in jobs)
    assert len(submit_calls) == 2  # one /parse/async per image, no duplicates


def test_openparser_mode_resumes_without_resubmitting(fixture: _Fixture) -> None:
    settings = _pipeline_settings()
    fixture.build(settings)
    submit_calls: list[str] = []
    handler = _make_handler(submit_calls)

    def fake_pool(_settings: Settings) -> OpenParserKeyPool:
        return OpenParserKeyPool(_settings, transport=httpx.MockTransport(handler))

    with patch("app.jobs.pipeline.get_settings", return_value=settings), \
         patch("app.jobs.pipeline.OpenParserKeyPool", side_effect=fake_pool), \
         patch("app.jobs.pipeline.structure", return_value=_empty_extraction()):
        run_pipeline(fixture.scan_session.id)  # first run: completes everything
        jobs_after_first = fixture.refresh_jobs()
        assert len(jobs_after_first) == 2
        assert len(submit_calls) == 2

        # Simulate a restart mid-flight: textExtraction already completed —
        # calling run_pipeline again must resume from the persisted
        # artifacts, never resubmit.
        run_pipeline(fixture.scan_session.id)

    jobs_after_second = fixture.refresh_jobs()
    assert len(jobs_after_second) == 2  # no new rows created
    assert len(submit_calls) == 2  # /parse/async never hit again


def test_disabled_provider_fails_the_stage_cleanly(fixture: _Fixture) -> None:
    settings = _pipeline_settings(ocr_provider="disabled")
    fixture.build(settings)

    with patch("app.jobs.pipeline.get_settings", return_value=settings):
        run_pipeline(fixture.scan_session.id)

    fixture.db.refresh(fixture.scan_session)
    text_extraction = next(s for s in fixture.scan_session.stages if s["id"] == "textExtraction")
    assert text_extraction["state"] == "failed"
    assert "disabled" in text_extraction["failureReason"].lower()
    assert fixture.refresh_jobs() == []


def test_openparser_shadow_mode_failure_never_affects_the_authoritative_paddle_result(
    fixture: _Fixture,
) -> None:
    settings = _pipeline_settings(ocr_provider="openparser_shadow")
    fixture.build(settings)

    def _raising_pool(_settings: Settings):
        raise RuntimeError("shadow pool construction failed")

    with patch("app.jobs.pipeline.get_settings", return_value=settings), \
         patch("app.jobs.pipeline.OpenParserKeyPool", side_effect=_raising_pool), \
         patch("app.jobs.pipeline.PaddleOcrProvider") as mock_provider_cls, \
         patch("app.jobs.pipeline._fetch_image_bytes", return_value=b"fake-bytes"), \
         patch("app.jobs.pipeline.structure", return_value=_empty_extraction()):
        from app.services.ocr.provider import OcrBlock, OcrResult

        # >= FALLBACK_MIN_BLOCKS (3) so this never triggers a live
        # Gemini-fallback call.
        fake_blocks = [
            OcrBlock(image_id="img", text=f"line {i}", confidence=90.0, bbox=(0, 0, 10, 10), provider="paddleocr")
            for i in range(3)
        ]
        mock_provider_cls.return_value.extract.return_value = OcrResult(
            blocks=fake_blocks, provider="paddleocr", duration_ms=1.0
        )
        run_pipeline(fixture.scan_session.id)

    fixture.db.refresh(fixture.scan_session)
    text_extraction = next(s for s in fixture.scan_session.stages if s["id"] == "textExtraction")
    assert text_extraction["state"] == "completed"
    assert fixture.scan_session.record_id is not None
    # The shadow pool construction raised for every image — no OcrProviderJob
    # rows were ever created, and the authoritative Paddle result still won.
    assert fixture.refresh_jobs() == []
