"""
errors.py — the standard error envelope and its exception handlers.

Every error response takes the shape:

    { "error": { "code": "...", "message": "...", "requestId": "..." } }

The full domain error catalogue (JURISDICTION_DENIED, OCR_PROVIDER_FAILED,
...) still arrives with the endpoints that actually need it — adding those
now would mean dead codes nothing can trigger yet. AUTHENTICATION_ERROR and
AUTHORIZATION_ERROR are added now because Phase 1 has real, exercised code
paths for both (get_current_user's 401s, require_permission's 403s).
"""

from typing import Literal

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

ErrorCode = Literal[
    "VALIDATION_ERROR",
    "NOT_FOUND",
    "AUTHENTICATION_ERROR",
    "AUTHORIZATION_ERROR",
    "CONFLICT",
    "INTERNAL_ERROR",
]

_STATUS_TO_CODE: dict[int, ErrorCode] = {
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    422: "VALIDATION_ERROR",  # HTTP_422_UNPROCESSABLE_ENTITY / _CONTENT across Starlette versions
    status.HTTP_401_UNAUTHORIZED: "AUTHENTICATION_ERROR",
    status.HTTP_403_FORBIDDEN: "AUTHORIZATION_ERROR",
    # Added in Phase 3 for the record correction/verification immutability
    # checks (POST /records/{id}/corrections and /verify both 409 once a
    # record is Verified) — a real, expected outcome of normal use, not an
    # edge case worth leaving as a generic INTERNAL_ERROR.
    status.HTTP_409_CONFLICT: "CONFLICT",
    # 400/413 are real, expected client-input outcomes (bad-quality/
    # duplicate scan images, an oversized upload) — found mislabeled as
    # INTERNAL_ERROR during real end-to-end testing, which is misleading
    # for something the client caused and can fix by retrying differently.
    status.HTTP_400_BAD_REQUEST: "VALIDATION_ERROR",
    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE: "VALIDATION_ERROR",
}


def _request_id(request: Request) -> str:
    # Set by the request-ID middleware (core/logging.py) before any handler
    # or exception path runs. Falls back to "unknown" only if a handler ever
    # fires before that middleware does, which should not normally happen.
    return getattr(request.state, "request_id", "unknown")


def _error_body(code: ErrorCode, message: str, request_id: str, extra: dict | None = None) -> dict:
    body = {"code": code, "message": message, "requestId": request_id}
    if extra:
        body["details"] = extra
    return {"error": body}


def _split_detail(detail: object) -> tuple[str, dict | None]:
    # Several endpoints (scans.py's quality/duplicate rejection,
    # mobile_handoff.py's incomplete-angles check) raise HTTPException with
    # a dict detail shaped {"error": "<human message>", ...extra fields
    # like rejected/duplicateAngles/missingAngles}. Falling through to
    # str(detail) on those produces Python's dict-repr ("{'error': '...',
    # ...}") instead of the clean message they intended, and dropping the
    # extra fields entirely would silently discard real per-angle
    # diagnostic data the caller put there on purpose.
    if isinstance(detail, dict) and isinstance(detail.get("error"), str):
        extra = {k: v for k, v in detail.items() if k != "error"}
        return detail["error"], (extra or None)
    return str(detail), None


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        code = _STATUS_TO_CODE.get(exc.status_code, "INTERNAL_ERROR")
        message, extra = _split_detail(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(code, message, _request_id(request), extra),
            # Forward e.g. WWW-Authenticate from a 401 — dropping headers
            # here would silently discard exactly the header a real client
            # needs to tell "not logged in" apart from "logged in wrong".
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_error_body("VALIDATION_ERROR", "Request validation failed.", _request_id(request)),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Never leak internal exception details to the client — the real
        # message goes to the structured log (core/logging.py), keyed by the
        # same request_id, so it's still fully diagnosable server-side.
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body("INTERNAL_ERROR", "An unexpected error occurred.", _request_id(request)),
        )
