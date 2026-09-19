"""
OP-Phase 2 addendum — OpenParserKeyPool tests. Confirms round-robin
admission across multiple keys, job-to-key pinning (a poll/result call for
a job always routes through the SAME key that admitted it, regardless of
where the rotation pointer has since moved), automatic skip of a key that
fails auth/billing, and the all-keys-exhausted terminal case. Every test
uses `httpx.MockTransport` fakes — no real network call.
"""

from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.services.ocr.openparser import (
    OpenParserAllKeysExhausted,
    OpenParserKeyPool,
    OpenParserUnknownJob,
)
from tests.contract.openparser_fakes import error_response, fixture_response, zero_jitter


def _settings(*, key_count: int = 3, **overrides) -> Settings:
    keys = ",".join(f"eig_live_fakekey{i:03d}" for i in range(1, key_count + 1))
    base = {
        "database_url": "postgresql+psycopg://u:p@localhost/db",
        "s3_endpoint_url": "https://example.invalid",
        "s3_access_key": "x",
        "s3_secret_key": "x",
        "s3_bucket": "x",
        "supabase_anon_key": "x",
        "supabase_jwt_secret": "x" * 32,
        "openparser_api_key": keys,
        "openparser_submission_max_attempts": 1,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _pool(handler, *, settings: Settings | None = None) -> OpenParserKeyPool:
    return OpenParserKeyPool(
        settings or _settings(), transport=httpx.MockTransport(handler), jitter=zero_jitter
    )


def test_pool_requires_at_least_one_key() -> None:
    settings = _settings(key_count=0, openparser_api_key=None)
    with pytest.raises(ValueError, match="at least one key"):
        OpenParserKeyPool(settings)


def test_openparser_api_keys_parses_the_comma_separated_field() -> None:
    settings = _settings(key_count=5)
    assert len(settings.openparser_api_keys) == 5
    assert settings.openparser_api_keys[0] == "eig_live_fakekey001"


# --- round-robin admission ---------------------------------------------


def test_submissions_round_robin_across_every_key_in_order() -> None:
    seen_auth: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_auth.append(request.headers["authorization"])
        job_id = f"opj_{len(seen_auth)}"
        return httpx.Response(
            202,
            json={
                "id": job_id,
                "operation": "parse",
                "status": "queued",
                "output_format": "openparser@1",
                "created_at": "2026-09-18T10:00:00Z",
                "updated_at": "2026-09-18T10:00:00Z",
            },
            headers={"location": f"/jobs/{job_id}"},
        )

    with _pool(handler, settings=_settings(key_count=3)) as pool:
        for _ in range(6):
            pool.submit_parse_async(
                file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
            )

    # 6 submissions over 3 keys, round-robin -> each key used exactly twice,
    # and never the same key on two consecutive calls.
    assert seen_auth[0] == seen_auth[3]
    assert seen_auth[1] == seen_auth[4]
    assert seen_auth[2] == seen_auth[5]
    assert len({seen_auth[0], seen_auth[1], seen_auth[2]}) == 3


# --- job-to-key pinning ---------------------------------------------------


def test_poll_and_result_route_through_the_same_key_that_admitted_the_job() -> None:
    admitting_key_for = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            job_id = "opj_pinned_example"
            admitting_key_for[job_id] = request.headers["authorization"]
            return httpx.Response(
                202,
                json={
                    "id": job_id,
                    "operation": "parse",
                    "status": "queued",
                    "output_format": "openparser@1",
                    "created_at": "2026-09-18T10:00:00Z",
                    "updated_at": "2026-09-18T10:00:00Z",
                },
                headers={"location": f"/jobs/{job_id}"},
            )
        # A poll/result GET — assert it arrives on the SAME key that admitted it.
        job_id = request.url.path.split("/")[2]
        assert request.headers["authorization"] == admitting_key_for[job_id], (
            "poll used a different key than the one that admitted this job"
        )
        return httpx.Response(
            200,
            json={
                "id": job_id,
                "operation": "parse",
                "status": "running",
                "output_format": "openparser@1",
                "created_at": "2026-09-18T10:00:00Z",
                "updated_at": "2026-09-18T10:00:00Z",
                "completed_at": None,
                "pipeline_id": None,
                "pipeline_version": None,
            },
        )

    with _pool(handler, settings=_settings(key_count=5)) as pool:
        admitted = pool.submit_parse_async(
            file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
        )
        # Several more admissions in between — rotates the pointer well
        # past the key that admitted the first job.
        for _ in range(4):
            pool.submit_parse_async(
                file_bytes=b"y", filename="g.jpg", content_type="image/jpeg", idempotency_key="k2"
            )
        job = pool.get_job(admitted.id)

    assert job.status == "running"


def test_get_job_for_an_unadmitted_job_id_raises_clearly() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("should never reach the network for an unknown job")

    with _pool(handler) as pool:
        with pytest.raises(OpenParserUnknownJob):
            pool.get_job("opj_never_submitted")


# --- automatic skip on auth/billing failure -------------------------------


def test_a_key_that_fails_auth_is_skipped_for_future_admissions() -> None:
    calls_by_key: dict[str, int] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        key = request.headers["authorization"]
        calls_by_key[key] = calls_by_key.get(key, 0) + 1
        if key == "Bearer eig_live_fakekey001":
            return error_response(status=401, code="unauthorized", message="revoked", retryable=False)
        job_id = f"opj_{calls_by_key[key]}_{key[-3:]}"
        return httpx.Response(
            202,
            json={
                "id": job_id,
                "operation": "parse",
                "status": "queued",
                "output_format": "openparser@1",
                "created_at": "2026-09-18T10:00:00Z",
                "updated_at": "2026-09-18T10:00:00Z",
            },
            headers={"location": f"/jobs/{job_id}"},
        )

    with _pool(handler, settings=_settings(key_count=3)) as pool:
        # key-1 is first in rotation and always 401s -> the pool must fall
        # through to key-2 within this SAME call, never surfacing the 401
        # to the caller as long as another key works.
        result = pool.submit_parse_async(
            file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
        )
        assert result.id.endswith("002")
        assert "key-1" in pool.disabled_aliases

        # A second admission must never try key-1 again.
        pool.submit_parse_async(
            file_bytes=b"y", filename="g.jpg", content_type="image/jpeg", idempotency_key="k2"
        )
    assert calls_by_key["Bearer eig_live_fakekey001"] == 1


def test_all_keys_exhausted_raises_a_distinct_terminal_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return error_response(status=402, code="insufficient_credits", message="no credit", retryable=False)

    with _pool(handler, settings=_settings(key_count=3)) as pool:
        with pytest.raises(OpenParserAllKeysExhausted):
            pool.submit_parse_async(
                file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
            )
    assert len(pool.disabled_aliases) == 3


def test_enable_recovers_a_manually_re_credited_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return error_response(status=402, code="insufficient_credits", message="no credit", retryable=False)

    pool = OpenParserKeyPool(
        _settings(key_count=1), transport=httpx.MockTransport(handler), jitter=zero_jitter
    )
    with pytest.raises(OpenParserAllKeysExhausted):
        pool.submit_parse_async(
            file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
        )
    assert pool.disabled_aliases == frozenset({"key-1"})

    pool.enable("key-1")
    assert pool.disabled_aliases == frozenset()
    pool.close()


# --- catalog reads are tenant-independent, no pinning ----------------------


def test_list_ocr_models_uses_any_non_disabled_key() -> None:
    with _pool(lambda request: fixture_response("models_catalog")) as pool:
        result = pool.list_ocr_models()
    assert result.data[0].id == "paddleocr-vl-1.6"


# --- adding more keys later is just editing config, generic over N --------


@pytest.mark.parametrize("key_count", [1, 2, 7, 15])
def test_pool_works_generically_over_any_number_of_keys(key_count: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            202,
            json={
                "id": "opj_x",
                "operation": "parse",
                "status": "queued",
                "output_format": "openparser@1",
                "created_at": "2026-09-18T10:00:00Z",
                "updated_at": "2026-09-18T10:00:00Z",
            },
            headers={"location": "/jobs/opj_x"},
        )

    with _pool(handler, settings=_settings(key_count=key_count)) as pool:
        assert pool.key_count == key_count
        result = pool.submit_parse_async(
            file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
        )
    assert result.id == "opj_x"
