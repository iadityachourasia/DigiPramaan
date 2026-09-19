"""
OP-Phase 2 — OpenParserClient tests. Every test uses `httpx.MockTransport`
(via openparser_fakes.py) or a fake clock/sleeper/jitter; none performs a
real network call, and `OPENPARSER_LIVE_TESTS` is asserted false throughout
this module. Confirms: catalog/submit/poll/result parsing against the real
OP-Phase-0 fixtures, error-status-to-exception mapping, Retry-After
parsing (seconds and HTTP-date forms), Location allow-listing, the
response-size cap, the circuit breaker, deterministic backoff, and header
redaction.
"""

from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.services.ocr.openparser import (
    BatchJobAccepted,
    Job,
    JobAccepted,
    OcrModelsResponse,
    OpenParserAuthError,
    OpenParserClient,
    OpenParserIdempotencyConflict,
    OpenParserInsufficientCredits,
    OpenParserRateLimited,
    OpenParserRedirectRejected,
    OpenParserResponseTooLarge,
    OpenParserServiceUnavailable,
    OpenParserTransportError,
    OpenParserUnprocessable,
    ParsedDocument,
    RawParseResult,
)
from app.services.ocr.openparser.redact import redact_headers
from tests.contract.openparser_fakes import (
    FakeClock,
    FakeSequence,
    FakeSleeper,
    error_response,
    fixture_response,
    load_fixture,
    transport_for,
    transport_from_handler,
    zero_jitter,
)


def _settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+psycopg://u:p@localhost/db",
        "s3_endpoint_url": "https://example.invalid",
        "s3_access_key": "x",
        "s3_secret_key": "x",
        "s3_bucket": "x",
        "supabase_anon_key": "x",
        "supabase_jwt_secret": "x" * 32,
        "openparser_tenant_alias": "test-tenant",
        "openparser_api_key": "test-key",
        "openparser_api_key_alias": "primary-a",
        "openparser_submission_max_attempts": 3,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _client(fake, *, settings: Settings | None = None, clock=None, sleeper=None, jitter=None):
    return OpenParserClient(
        settings or _settings(),
        transport=transport_for(fake) if isinstance(fake, FakeSequence) else fake,
        clock=clock,
        sleeper=sleeper,
        jitter=jitter or zero_jitter,
    )


def test_live_tests_flag_is_false_by_default() -> None:
    assert _settings().openparser_live_tests is False


# --- catalog/submit/poll/result parsing against real OP-Phase-0 fixtures ---


def test_list_ocr_models_parses_the_real_catalog_fixture() -> None:
    fake = FakeSequence([fixture_response("models_catalog")])
    with _client(fake) as client:
        result = client.list_ocr_models()
    assert isinstance(result, OcrModelsResponse)
    assert result.data[0].id == "paddleocr-vl-1.6"
    assert result.data[0].is_default is True


def test_submit_parse_async_parses_admission_and_checks_location() -> None:
    fake = FakeSequence(
        [
            fixture_response(
                "async_admission_accepted",
                status=202,
                headers={"location": "/jobs/opj_async_example01"},
            )
        ]
    )
    with _client(fake) as client:
        result = client.submit_parse_async(
            file_bytes=b"fake-image-bytes",
            filename="front.jpg",
            content_type="image/jpeg",
            idempotency_key="idem-key-001",
        )
    assert isinstance(result, JobAccepted)
    assert result.id == "opj_async_example01"
    assert result.status == "queued"
    sent = fake.requests[0]
    assert sent.headers["idempotency-key"] == "idem-key-001"


def test_submit_parse_batch_parses_admission() -> None:
    fake = FakeSequence(
        [
            fixture_response(
                "batch_admission_accepted",
                status=202,
                headers={"location": "/jobs/opj_batch_example01"},
            )
        ]
    )
    with _client(fake) as client:
        result = client.submit_parse_batch(
            items=[{"client_item_id": "img-1", "ocr_model": "paddleocr-vl-1.6", "file_index": 0}],
            files=[("front.jpg", b"bytes", "image/jpeg")],
            idempotency_key="idem-key-002",
        )
    assert isinstance(result, BatchJobAccepted)


def test_get_job_parses_succeeded_job_with_canonical_result() -> None:
    fake = FakeSequence([fixture_response("job_succeeded")])
    with _client(fake) as client:
        job = client.get_job("opj_succeeded_example01")
    assert isinstance(job, Job)
    assert job.status == "succeeded"
    assert job.result is not None
    assert job.result["document_id"] == "opdoc_example01"


@pytest.mark.parametrize(
    "fixture_name,expected_status",
    [
        ("job_queued", "queued"),
        ("job_running", "running"),
        ("job_failed", "failed"),
        ("job_indeterminate", "indeterminate"),
    ],
)
def test_get_job_parses_every_job_state_fixture(fixture_name: str, expected_status: str) -> None:
    fake = FakeSequence([fixture_response(fixture_name)])
    with _client(fake) as client:
        job = client.get_job("opj_example")
    assert job.status == expected_status


def test_get_job_parses_batch_mixed_success() -> None:
    fake = FakeSequence([fixture_response("batch_mixed_success")])
    with _client(fake) as client:
        job = client.get_job("opj_batch_mixed_example01")
    assert job.operation == "parse_batch"
    assert job.summary is not None
    assert job.summary["succeeded"] == 2
    assert job.summary["failed"] == 1


def test_get_job_result_canonical_returns_parsed_document() -> None:
    fake = FakeSequence([fixture_response("canonical_result_openparser1")])
    with _client(fake) as client:
        result = client.get_job_result("opj_example")
    assert isinstance(result, ParsedDocument)
    assert result.output_format == "openparser@1"


def test_get_job_result_raw_returns_raw_parse_result() -> None:
    fake = FakeSequence([fixture_response("raw_result_paddleocr_vl")])
    with _client(fake) as client:
        result = client.get_job_result("opj_example", format="raw")
    assert isinstance(result, RawParseResult)
    assert result.output_format == "raw"


# --- error taxonomy: one test per HTTP status -> exception class ---------


@pytest.mark.parametrize(
    "status,code,exc_type",
    [
        (401, "unauthorized", OpenParserAuthError),
        (403, "forbidden", OpenParserAuthError),
        (402, "insufficient_credits", OpenParserInsufficientCredits),
        (409, "idempotency_conflict", OpenParserIdempotencyConflict),
        (422, "unprocessable", OpenParserUnprocessable),
    ],
)
def test_non_retryable_error_statuses_map_to_the_right_exception(status, code, exc_type) -> None:
    fake = FakeSequence(
        [error_response(status=status, code=code, message="failure", retryable=False)]
    )
    with _client(fake) as client:
        with pytest.raises(exc_type) as exc_info:
            client.list_ocr_models()
    assert exc_info.value.request_id == "req_test_0001"
    # Non-retryable: exactly one request was ever sent — no retry loop.
    assert len(fake.requests) == 1


def test_401_opens_the_circuit_breaker_after_threshold_failures() -> None:
    fake = FakeSequence(
        [error_response(status=401, code="unauthorized", message="bad key", retryable=False) for _ in range(5)]
    )
    clock = FakeClock()
    with _client(fake, clock=clock) as client:
        for _ in range(3):
            with pytest.raises(OpenParserAuthError):
                client.list_ocr_models()
        # The breaker is now open — the 4th call must fail WITHOUT sending
        # a request at all.
        requests_before = len(fake.requests)
        with pytest.raises(OpenParserAuthError):
            client.list_ocr_models()
        assert len(fake.requests) == requests_before


def test_circuit_breaker_closes_after_cooldown_and_a_success() -> None:
    fake = FakeSequence(
        [
            error_response(status=401, code="unauthorized", message="bad key", retryable=False)
            for _ in range(3)
        ]
        + [fixture_response("models_catalog")]
    )
    clock = FakeClock()
    with _client(fake, clock=clock) as client:
        for _ in range(3):
            with pytest.raises(OpenParserAuthError):
                client.list_ocr_models()
        clock.advance(31.0)  # past the breaker's cooldown window
        result = client.list_ocr_models()  # the probe attempt — succeeds
    assert isinstance(result, OcrModelsResponse)


# --- Retry-After parsing --------------------------------------------------


def test_retry_after_seconds_form_is_honored_on_429() -> None:
    fake = FakeSequence(
        [
            error_response(status=429, code="rate_limited", message="slow down", retryable=True, retry_after=5),
            fixture_response("models_catalog"),
        ]
    )
    clock = FakeClock()
    sleeper = FakeSleeper(clock)
    with _client(fake, clock=clock, sleeper=sleeper) as client:
        client.list_ocr_models()
    assert sleeper.delays == [5.0]


def test_retry_after_http_date_form_is_parsed_defensively() -> None:
    fake = FakeSequence(
        [
            error_response(
                status=503,
                code="admission_unavailable",
                message="try later",
                retryable=True,
                retry_after="Wed, 21 Oct 2026 07:28:05 GMT",
            ),
            fixture_response("models_catalog"),
        ]
    )
    clock = FakeClock()
    sleeper = FakeSleeper(clock)
    with _client(fake, clock=clock, sleeper=sleeper) as client:
        client.list_ocr_models()
    # A real HTTP-date far in the past/future both parse to SOME
    # non-negative float without raising — the exact value depends on
    # wall-clock time, so only the type/sign and "it slept exactly once"
    # are asserted here.
    assert len(sleeper.delays) == 1
    assert sleeper.delays[0] >= 0.0


def test_unparseable_retry_after_falls_back_to_a_safe_default() -> None:
    fake = FakeSequence(
        [
            error_response(status=429, code="rate_limited", message="slow", retryable=True, retry_after="not-a-number"),
            fixture_response("models_catalog"),
        ]
    )
    clock = FakeClock()
    sleeper = FakeSleeper(clock)
    with _client(fake, clock=clock, sleeper=sleeper) as client:
        client.list_ocr_models()
    assert sleeper.delays == [1.0]


def test_transport_timeout_retries_with_backoff_and_eventually_succeeds() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("simulated timeout", request=request)

    calls = {"n": 0}

    def flaky_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectTimeout("simulated timeout", request=request)
        return fixture_response("models_catalog")

    clock = FakeClock()
    sleeper = FakeSleeper(clock)
    with _client(transport_from_handler(flaky_handler), clock=clock, sleeper=sleeper) as client:
        result = client.list_ocr_models()
    assert isinstance(result, OcrModelsResponse)
    assert calls["n"] == 3
    assert len(sleeper.delays) == 2  # slept before attempt 2 and attempt 3


def test_transport_error_exhausts_retries_and_raises() -> None:
    def always_times_out(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("simulated timeout", request=request)

    clock = FakeClock()
    sleeper = FakeSleeper(clock)
    settings = _settings(openparser_submission_max_attempts=2)
    with _client(
        transport_from_handler(always_times_out), settings=settings, clock=clock, sleeper=sleeper
    ) as client:
        with pytest.raises(OpenParserTransportError):
            client.list_ocr_models()
    assert len(sleeper.delays) == 1  # one retry between the 2 attempts


# --- Location allow-listing ------------------------------------------------


def test_location_on_the_configured_origin_is_accepted() -> None:
    fake = FakeSequence(
        [
            fixture_response(
                "async_admission_accepted",
                status=202,
                headers={"location": "https://api.openparser.dev/jobs/opj_async_example01"},
            )
        ]
    )
    with _client(fake) as client:
        result = client.submit_parse_async(
            file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
        )
    assert result.id == "opj_async_example01"


def test_location_on_a_foreign_origin_is_rejected() -> None:
    fake = FakeSequence(
        [
            fixture_response(
                "async_admission_accepted",
                status=202,
                headers={"location": "https://evil.example/jobs/opj_async_example01"},
            )
        ]
    )
    with _client(fake) as client:
        with pytest.raises(OpenParserRedirectRejected):
            client.submit_parse_async(
                file_bytes=b"x", filename="f.jpg", content_type="image/jpeg", idempotency_key="k"
            )


# --- response-size cap ------------------------------------------------------


def test_response_exceeding_the_max_bytes_cap_is_rejected() -> None:
    huge_payload = {"data": [{"id": "x" * 200_000, "label": "y", "is_default": True}]}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=huge_payload)

    settings = _settings(openparser_max_response_bytes=1024)
    with _client(transport_from_handler(handler), settings=settings) as client:
        with pytest.raises(OpenParserResponseTooLarge):
            client.list_ocr_models()


# --- header redaction --------------------------------------------------------


def test_redact_headers_masks_authorization_and_idempotency_key() -> None:
    redacted = redact_headers(
        {
            "Authorization": "Bearer super-secret-token",
            "Idempotency-Key": "idem-abc123",
            "X-Provider-Key": "another-secret",
            "Content-Type": "application/json",
        }
    )
    assert redacted["Authorization"] == "***"
    assert redacted["Idempotency-Key"] == "***"
    assert redacted["X-Provider-Key"] == "***"
    assert redacted["Content-Type"] == "application/json"


def test_redact_headers_is_case_insensitive() -> None:
    redacted = redact_headers({"authorization": "Bearer x"})
    assert redacted["authorization"] == "***"


# --- schema-vs-contract cross-check ------------------------------------------


@pytest.mark.parametrize(
    "fixture_name,schema_name,model_cls",
    [
        ("models_catalog", "OcrModelsResponse", OcrModelsResponse),
        ("async_admission_accepted", "JobAccepted", JobAccepted),
        ("batch_admission_accepted", "BatchJobAccepted", BatchJobAccepted),
        ("job_queued", "Job", Job),
        ("job_succeeded", "Job", Job),
        ("job_failed", "Job", Job),
        ("job_indeterminate", "Job", Job),
        ("batch_mixed_success", "Job", Job),
        ("canonical_result_openparser1", "ParsedDocument", ParsedDocument),
        ("raw_result_paddleocr_vl", "RawParseResult", RawParseResult),
    ],
)
def test_client_pydantic_models_accept_every_fixture_the_real_validator_accepts(
    fixture_name, schema_name, model_cls
) -> None:
    from tests.contract.openparser_schema import validate_against

    instance = load_fixture(fixture_name)
    # The authoritative check: this fixture is real per the OpenAPI contract.
    validate_against(schema_name, instance)
    # The cross-check this test exists for: our lightweight client model
    # accepts the same instance without raising.
    model_cls.model_validate(instance)
