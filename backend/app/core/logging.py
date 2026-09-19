"""
logging.py — structured JSON logging and the request-ID middleware.

Fields logged per request: request_id, method, path, status_code, duration_ms.

Deliberately NO user_id/jurisdiction_id/scan_id yet — those concepts don't
exist in the real backend until auth (Phase 3) and the scan pipeline
(Phase 6). Adding the fields now would mean either faking values or leaving
them permanently null; both are worse than adding them when they become real.
"""

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"

# P2 hardening (2026-09-19, F-008): the raw mobile-handoff token (a bearer
# credential for the phone-side capture session, `secrets.token_urlsafe`)
# travels in the URL PATH on 3 routes (see api/v1/mobile_handoff.py's own
# module docstring on why — the QR-code UX needs it there) — logging
# `request.url.path` verbatim, as every request already does, put that
# token into the structured JSON log stream on every request. Redact just
# that one path segment, matching the "one targeted redaction helper"
# discipline services/ocr/openparser/redact.py already established for
# header secrets.
_MOBILE_HANDOFF_TOKEN_PATH = re.compile(r"(/mobile-handoff/)[^/]+")


def _redact_path(path: str) -> str:
    return _MOBILE_HANDOFF_TOKEN_PATH.sub(r"\1***", path)


# P2 hardening (F-019): an inbound X-Request-ID is untrusted input — never
# log-inject, never unbounded. A well-formed value (UUID/ULID/any
# reasonable correlation-id convention an upstream layer might already
# stamp) is echoed back; anything else silently gets a fresh generated id
# instead (this server declining to trust an untrusted header shape is not
# the caller's fault to fix, so this never fails the request over it).
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def configure_logging(log_level: str) -> None:
    logging.basicConfig(format="%(message)s", level=log_level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(log_level)),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns (or honors an inbound) request id, binds it to the structlog
    context for every log line emitted while handling this request, returns
    it in the response header, and logs one summary line per request."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        inbound = request.headers.get(REQUEST_ID_HEADER)
        request_id = inbound if inbound and _REQUEST_ID_RE.match(inbound) else str(uuid.uuid4())
        request.state.request_id = request_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        logger = structlog.get_logger("digipramaan.request")
        started_at = time.perf_counter()

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id
        logger.info(
            "request_completed",
            method=request.method,
            path=_redact_path(request.url.path),
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
