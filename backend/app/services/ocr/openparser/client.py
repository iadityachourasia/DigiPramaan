"""
services/ocr/openparser/client.py — OpenParserClient, the ONE place this
codebase talks HTTP to OpenParser. OP-Phase 2: wire client only — nothing
in this module is called from anywhere in the pipeline yet (see this
file's own tests, never `app/jobs/pipeline.py` or `api/v1/scans.py`).

SYNC, not async — a deliberate match to this codebase's existing
architecture (`app/db/session.py`'s own docstring: "Sync, not async...
simpler to write, test, and debug"), and to the existing hardened outbound
`httpx` client precedent this module follows most closely,
`services/ecommerce/fetcher.py` (manual redirect handling, a streamed byte
cap, its own typed error). The implementation spec's generic advice
("implement a dedicated async client") describes what a from-scratch
integration would default to; this codebase already made and documented
the opposite choice everywhere else, and one integration using a different
concurrency model than every other outbound call in the same process is a
worse outcome than following the spec's letter here.

Every endpoint this client calls is confirmed against `OCR_API_OPENAPI.yaml`
(checksum unchanged since OP-Phase 0 — re-verify before editing this file):
`GET /models/ocr`, `POST /parse/async`, `POST /parse/batch`,
`GET /jobs/{id}`, `GET /jobs/{id}/result`.
"""

from __future__ import annotations

import email.utils
import json
import random
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit, urljoin

import httpx
import structlog

from app.core.config import Settings
from app.services.ocr.openparser.errors import (
    OpenParserAuthError,
    OpenParserError,
    OpenParserIdempotencyConflict,
    OpenParserInsufficientCredits,
    OpenParserRateLimited,
    OpenParserRedirectRejected,
    OpenParserResponseTooLarge,
    OpenParserServiceUnavailable,
    OpenParserTransportError,
    OpenParserUnprocessable,
)
from app.services.ocr.openparser.redact import redact_headers
from app.services.ocr.openparser.schemas import (
    BatchJobAccepted,
    Job,
    JobAccepted,
    OcrModelsResponse,
    ParsedDocument,
    RawParseResult,
)

logger = structlog.get_logger(__name__)

_USER_AGENT = "DigiPramaan/1.0 (+ocr-migration)"


def _parse_retry_after(value: str | None) -> float:
    """Spec §10: "Retry-After parser supporting the contract's seconds
    form and defensively supporting HTTP dates." Never raises — an
    unparseable value falls back to a conservative fixed wait rather than
    blocking or crashing the caller."""
    if not value:
        return 1.0
    stripped = value.strip()
    if stripped.isdigit():
        return float(stripped)
    try:
        parsed = email.utils.parsedate_to_datetime(stripped)
    except (TypeError, ValueError):
        return 1.0
    if parsed is None:
        return 1.0
    delta = parsed.timestamp() - time.time()
    return max(delta, 0.0)


class _CircuitBreaker:
    """One breaker per provider tenant alias, in-memory only — Phase 3's
    job table is where cross-process/cross-restart state belongs; this is
    just enough to stop a single client instance from hammering a
    credential that's already failing auth/billing checks (spec §7.3:
    "open circuit for the credential, do not cycle through unrelated
    tenants"). `threshold` consecutive failures opens it; it stays open
    for `cooldown_seconds` before allowing one more attempt through."""

    def __init__(self, *, threshold: int = 3, cooldown_seconds: float = 30.0) -> None:
        self._threshold = threshold
        self._cooldown_seconds = cooldown_seconds
        self._failures: dict[str, int] = {}
        self._opened_at: dict[str, float] = {}

    def is_open(self, tenant_alias: str, *, now: float) -> bool:
        opened_at = self._opened_at.get(tenant_alias)
        if opened_at is None:
            return False
        if now - opened_at >= self._cooldown_seconds:
            # Cooldown elapsed — allow exactly one probe attempt through;
            # record_failure()/record_success() decide what happens next.
            del self._opened_at[tenant_alias]
            self._failures[tenant_alias] = self._threshold - 1
            return False
        return True

    def record_failure(self, tenant_alias: str, *, now: float) -> None:
        count = self._failures.get(tenant_alias, 0) + 1
        self._failures[tenant_alias] = count
        if count >= self._threshold:
            self._opened_at[tenant_alias] = now

    def record_success(self, tenant_alias: str) -> None:
        self._failures.pop(tenant_alias, None)
        self._opened_at.pop(tenant_alias, None)


class OpenParserClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] | None = None,
        sleeper: Callable[[float], None] | None = None,
        jitter: Callable[[], float] | None = None,
        api_key_override: str | None = None,
        tenant_alias_override: str | None = None,
    ) -> None:
        """`transport`/`clock`/`sleeper`/`jitter` are the spec's own
        "injectable clock, sleeper, transport, and random jitter for
        deterministic tests" requirement (§10) — production code never
        passes any of them; tests always pass all four so nothing in the
        suite performs a real network call or a real `time.sleep`.

        `api_key_override`/`tenant_alias_override` let a caller construct
        a client for ONE specific key out of `settings.openparser_api_keys`
        rather than always reading the first/singular one — this is what
        `OpenParserKeyPool` (pool.py) uses to hold one `OpenParserClient`
        per configured key, each with its own circuit breaker."""
        self._settings = settings
        self._clock = clock or time.monotonic
        self._sleeper = sleeper or time.sleep
        self._jitter = jitter or random.random
        self._circuit = _CircuitBreaker()
        self._tenant_alias = tenant_alias_override or settings.openparser_tenant_alias or "unconfigured"

        if api_key_override is not None:
            api_key = api_key_override
        else:
            api_key = settings.openparser_api_key.get_secret_value() if settings.openparser_api_key else ""
        self._client = httpx.Client(
            base_url=settings.openparser_base_url,
            timeout=httpx.Timeout(
                connect=settings.openparser_connect_timeout_seconds,
                write=settings.openparser_write_timeout_seconds,
                read=settings.openparser_read_timeout_seconds,
                pool=settings.openparser_pool_timeout_seconds,
            ),
            headers={"User-Agent": _USER_AGENT, "Authorization": f"Bearer {api_key}"},
            follow_redirects=False,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "OpenParserClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    # ------------------------------------------------------------------ #
    # Public API — one method per confirmed contract endpoint.
    # ------------------------------------------------------------------ #

    def list_ocr_models(self) -> OcrModelsResponse:
        body = self._request("GET", "/models/ocr")
        return OcrModelsResponse.model_validate(body)

    def submit_parse_async(
        self,
        *,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        idempotency_key: str,
        ocr_model: str | None = None,
        output_format: str = "openparser@1",
    ) -> JobAccepted:
        request_part = {
            "ocr_model": ocr_model or self._settings.openparser_ocr_model,
            "output_format": output_format,
        }
        response, headers = self._request_with_headers(
            "POST",
            "/parse/async",
            headers={"Idempotency-Key": idempotency_key},
            files={"file": (filename, file_bytes, content_type)},
            data={"request": _json_dumps(request_part)},
        )
        self._check_location(headers.get("location"))
        return JobAccepted.model_validate(response)

    def submit_parse_batch(
        self,
        *,
        items: list[dict[str, Any]],
        files: list[tuple[str, bytes, str]],
        idempotency_key: str,
        output_format: str = "openparser@1",
    ) -> BatchJobAccepted:
        """`items` is the contract's own `ParseBatchRequest.items` shape
        (each with `client_item_id`, `ocr_model`, and either `file_index`
        or `file_id`) — the caller (Phase 3+) owns mapping local
        `EvidenceImage.id`s to `client_item_id`, this method only sends
        the request. `files` is ordered and indexed by each item's own
        `file_index`."""
        request_part = {"items": items, "output_format": output_format}
        multipart_files = [
            ("files", (filename, content, content_type)) for filename, content, content_type in files
        ]
        response, headers = self._request_with_headers(
            "POST",
            "/parse/batch",
            headers={"Idempotency-Key": idempotency_key},
            files=multipart_files,
            data={"request": _json_dumps(request_part)},
        )
        self._check_location(headers.get("location"))
        return BatchJobAccepted.model_validate(response)

    def get_job(self, job_id: str) -> Job:
        body = self._request("GET", f"/jobs/{job_id}")
        return Job.model_validate(body)

    def get_job_result(
        self, job_id: str, *, format: str | None = None
    ) -> ParsedDocument | RawParseResult:
        params = {"format": format} if format else None
        body = self._request("GET", f"/jobs/{job_id}/result", params=params)
        if body.get("output_format") == "raw":
            return RawParseResult.model_validate(body)
        return ParsedDocument.model_validate(body)

    # ------------------------------------------------------------------ #
    # Internals.
    # ------------------------------------------------------------------ #

    def _check_location(self, location: str | None) -> None:
        """Spec §10: "allow-listed resolution of Location." A `202`'s
        `Location` may be absolute or path-absolute (contract's own
        wording) — resolved against the configured base URL either way,
        and rejected outright if that doesn't land back on the same
        origin. Never followed automatically; callers always poll via
        `get_job(id)` using the id already in the parsed response body."""
        if location is None:
            return
        resolved = urljoin(str(self._client.base_url), location)
        resolved_origin = (urlsplit(resolved).scheme, urlsplit(resolved).netloc)
        configured_origin = (
            urlsplit(str(self._client.base_url)).scheme,
            urlsplit(str(self._client.base_url)).netloc,
        )
        if resolved_origin != configured_origin:
            raise OpenParserRedirectRejected(
                f"Location {location!r} resolved outside the configured OpenParser origin"
            )

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        body, _headers = self._request_with_headers(method, path, **kwargs)
        return body

    def _request_with_headers(
        self, method: str, path: str, **kwargs: Any
    ) -> tuple[dict[str, Any], httpx.Headers]:
        now = self._clock()
        if self._circuit.is_open(self._tenant_alias, now=now):
            raise OpenParserAuthError(
                "Circuit open for this tenant after repeated auth/billing failures",
                status_code=0,
            )

        attempts = max(self._settings.openparser_submission_max_attempts, 1)
        last_error: OpenParserError | None = None
        for attempt in range(1, attempts + 1):
            try:
                body, headers = self._send_once(method, path, **kwargs)
                self._circuit.record_success(self._tenant_alias)
                return body, headers
            except (OpenParserRateLimited, OpenParserServiceUnavailable, OpenParserTransportError) as exc:
                last_error = exc
                if attempt == attempts:
                    break
                delay = getattr(exc, "retry_after_seconds", None)
                if delay is None:
                    delay = min(2 ** (attempt - 1), 30)
                delay += self._jitter()
                self._sleeper(delay)
                continue
            except (OpenParserAuthError, OpenParserInsufficientCredits) as exc:
                self._circuit.record_failure(self._tenant_alias, now=self._clock())
                raise exc

        assert last_error is not None
        raise last_error

    def _send_once(
        self, method: str, path: str, *, headers: dict[str, str] | None = None, **kwargs: Any
    ) -> tuple[dict[str, Any], httpx.Headers]:
        merged_headers = {**(headers or {})}
        logger.debug(
            "openparser_request",
            method=method,
            path=path,
            headers=redact_headers({**self._client.headers, **merged_headers}),
        )
        try:
            with self._client.stream(method, path, headers=merged_headers, **kwargs) as response:
                self._raise_for_status(response)
                body_bytes = self._read_bounded(response)
        except httpx.TimeoutException as exc:
            raise OpenParserTransportError(f"Timed out calling OpenParser: {exc}") from exc
        except httpx.TransportError as exc:
            raise OpenParserTransportError(f"Transport error calling OpenParser: {exc}") from exc

        parsed = json.loads(body_bytes) if body_bytes else {}
        return parsed, response.headers

    def _read_bounded(self, response: httpx.Response) -> bytes:
        max_bytes = self._settings.openparser_max_response_bytes
        chunks: list[bytes] = []
        total = 0
        for chunk in response.iter_bytes():
            total += len(chunk)
            if total > max_bytes:
                raise OpenParserResponseTooLarge(
                    f"OpenParser response exceeded the {max_bytes}-byte cap"
                )
            chunks.append(chunk)
        return b"".join(chunks)

    def _raise_for_status(self, response: httpx.Response) -> None:
        status = response.status_code
        if status < 400:
            return

        request_id = None
        error_body: dict[str, Any] = {}
        # Error bodies are small (ErrorBody is a handful of fields) — safe
        # to read fully here rather than via the streamed bounded reader,
        # which exists for potentially large SUCCESS bodies.
        try:
            error_body = response.json().get("error", {})
            request_id = error_body.get("request_id")
        except (ValueError, AttributeError):
            pass

        message = error_body.get("message") or f"OpenParser returned HTTP {status}"

        if status in (401, 403):
            raise OpenParserAuthError(message, status_code=status, request_id=request_id)
        if status == 402:
            raise OpenParserInsufficientCredits(message, request_id=request_id)
        if status == 409:
            raise OpenParserIdempotencyConflict(message, request_id=request_id)
        if status == 422:
            raise OpenParserUnprocessable(
                message,
                code=error_body.get("code", "unknown"),
                details=error_body.get("details"),
                request_id=request_id,
            )
        if status == 429:
            retry_after = _parse_retry_after(response.headers.get("retry-after"))
            raise OpenParserRateLimited(message, retry_after_seconds=retry_after, request_id=request_id)
        if status == 503:
            retry_after = _parse_retry_after(response.headers.get("retry-after"))
            raise OpenParserServiceUnavailable(
                message, retry_after_seconds=retry_after, request_id=request_id
            )
        raise OpenParserError(message, request_id=request_id)


def _json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload)
