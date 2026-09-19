"""
OP-Phase 7 — proves the shadow comparison harness reads real, freshly
persisted Phase 3/5 data correctly: runs `run_pipeline` once under
`ocr_provider="openparser_shadow"` with a WORKING `httpx.MockTransport`
fake pool (so real `OcrProviderJob` rows actually reach `normalized`,
unlike the Phase 5 shadow test, which deliberately makes pool
construction fail), then calls `build_shadow_comparison_rows`/
`summarize_shadow_comparison` against the real result.

Same "runs ONLY against a dedicated, disposable TEST_DATABASE_URL"
discipline as every other integration test in this suite. No live
OpenParser or Gemini call — the OpenParser HTTP layer is faked via
`httpx.MockTransport`, and Gemini structuring is faked the same way
`tests/unit/test_pipeline.py` already does.
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
from app.services.ocr.openparser.shadow_comparison import (
    build_shadow_comparison_rows,
    summarize_shadow_comparison,
)

pytestmark = pytest.mark.integration


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


def _canonical_result(document_id: str) -> dict:
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
                # No confidence on this one — proves missing-confidence counting works.
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


def _make_working_handler():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST" and path == "/parse/async":
            job_id = f"opj_{uuid.uuid4().hex[:12]}"
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

    def build(self, settings: Settings) -> None:
        user_id = uuid.uuid4()
        self.db.execute(auth_users.insert().values(id=user_id))
        profile = Profile(
            id=user_id, username=f"opshadow-{self.run_id}", email=f"opshadow-{self.run_id}@example.invalid",
            full_name="OP Shadow Comparison Test", role="Enforcement Officer", region="Maharashtra",
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
        for angle, data in (
            ("front", b"\xff\xd8\xff\xe0" + b"fake-jpeg-front-bytes" * 10),
            ("back", b"\xff\xd8\xff\xe0" + b"fake-jpeg-back-bytes" * 10),
        ):
            key = f"evidence/opshadow-{self.run_id}/{self.scan_session.id}/{angle}.jpg"
            s3_client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
            image = EvidenceImage(
                scan_session_id=self.scan_session.id, angle=angle, storage_key=key,
                content_hash=f"{angle}-{self.run_id}", quality_result={"width": 100, "height": 100},
            )
            self.db.add(image)
            self.db.flush()
            self.evidence_image_ids.append(image.id)

        self.db.commit()

    def teardown(self) -> None:
        self.db.rollback()
        record = self.db.get(ScanSession, self.scan_session.id)
        if record is not None and record.record_id is not None:
            self.record_ids.append(record.record_id)
            record.record_id = None
            self.db.flush()
        jobs = (
            self.db.query(OcrProviderJob)
            .filter(OcrProviderJob.scan_session_id == self.scan_session.id)
            .all()
        )
        for model, ids in (
            (OcrProviderJob, [j.id for j in jobs]),
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


def _shadow_settings(run_id: str) -> Settings:
    real = get_settings()
    return Settings(
        database_url=real.database_url,
        test_database_url=real.test_database_url,
        supabase_url=real.supabase_url,
        supabase_anon_key=real.supabase_anon_key,
        supabase_jwt_secret=real.supabase_jwt_secret,
        s3_endpoint_url="http://localhost:9000",
        s3_access_key="minioadmin",
        s3_secret_key="minioadmin",
        s3_bucket=f"digipramaan-openparser-shadow-{run_id}",
        s3_region="us-east-1",
        s3_use_ssl=False,
        s3_auto_create_bucket=True,
        ocr_provider="openparser_shadow",
        openparser_api_key="eig_live_fake",
        openparser_api_key_alias="primary-a",
        openparser_tenant_alias="test-tenant",
        openparser_idempotency_secret="idem-secret",
        openparser_job_max_age_seconds=10,
        openparser_poll_min_seconds=0.01,
        openparser_submission_max_attempts=1,
    )  # type: ignore[arg-type]


def test_shadow_comparison_harness_reads_real_persisted_rows(fixture: _Fixture) -> None:
    settings = _shadow_settings(fixture.run_id)
    fixture.build(settings)
    handler = _make_working_handler()

    def fake_pool(_settings: Settings) -> OpenParserKeyPool:
        return OpenParserKeyPool(_settings, transport=httpx.MockTransport(handler))

    with patch("app.jobs.pipeline.get_settings", return_value=settings), \
         patch("app.jobs.pipeline.OpenParserKeyPool", side_effect=fake_pool), \
         patch("app.jobs.pipeline.PaddleOcrProvider") as mock_provider_cls, \
         patch("app.jobs.pipeline._fetch_image_bytes", return_value=b"fake-bytes"), \
         patch("app.jobs.pipeline.structure", return_value=_empty_extraction()):
        from app.services.ocr.provider import OcrBlock, OcrResult

        def fake_extract(image_bytes: bytes, image_id: str) -> OcrResult:
            # Real per-image blocks (keyed by the REAL EvidenceImage id, like
            # PaddleOcrProvider actually does) -- not a single shared fake
            # id, so the comparison harness's per-image grouping is
            # genuinely exercised.
            blocks = [
                OcrBlock(image_id=image_id, text=f"line {i}", confidence=90.0, bbox=(0, 0, 10, 10), provider="paddleocr")
                for i in range(3)
            ]
            return OcrResult(blocks=blocks, provider="paddleocr", duration_ms=1.0)

        mock_provider_cls.return_value.extract.side_effect = fake_extract
        run_pipeline(fixture.scan_session.id)

    # run_pipeline used its OWN SessionLocal() connection to commit — the
    # fixture's own long-lived session has stale identity-map state for
    # rows it read before that (e.g. scan_session.record_id) until expired.
    fixture.db.expire_all()

    s3_client = get_s3_client(settings)
    rows = build_shadow_comparison_rows(fixture.db, s3_client, settings, fixture.scan_session.id)

    assert len(rows) == 2  # front + back
    assert all(row.openparser_local_state == "normalized" for row in rows)
    assert all(row.paddle_block_count == 3 for row in rows)  # from the fake Paddle mock
    # el_1 has confidence, el_2 doesn't -- both elements present per job.
    assert all(row.openparser_element_count == 2 for row in rows)
    assert all(row.openparser_elements_with_confidence == 1 for row in rows)
    assert all(row.openparser_elements_missing_confidence == 1 for row in rows)

    summary = summarize_shadow_comparison(rows)
    assert summary.row_count == 2
    assert summary.terminal_success_rate == 1.0
    assert summary.mean_paddle_block_count == 3.0
    assert summary.mean_openparser_element_count == 2.0
    assert summary.missing_confidence_rate == 0.5
    assert summary.cost_data_available is False
    assert summary.paddle_latency_available is False
