"""
services/ocr/openparser/errors.py — the OpenParser client's error taxonomy.

One exception class per row of the implementation spec's own failure-policy
table (docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md §7.3) that
needs DISTINCT caller handling — never a bare `OpenParserError` a caller
has to string-match to react correctly. `ErrorBody.retryable` (the
contract's own field, `components.schemas.ErrorBody`) is what a future
retry policy should trust; the exception TYPE here is what a caller
branches on, and the two agree by construction (see client.py's own
status-to-exception mapping) rather than needing to be kept in sync by
hand.

`request_id` is carried on every exception for correlation — never the raw
response body (spec §16: "logs must not include... raw response").
"""

from __future__ import annotations


class OpenParserError(Exception):
    """Base class for every error this client raises. Never raised
    directly — always one of the subclasses below."""

    def __init__(self, message: str, *, request_id: str | None = None) -> None:
        self.request_id = request_id
        super().__init__(message)


class OpenParserTransportError(OpenParserError):
    """A timeout or connection failure before any definitive admission
    response was received. Spec §7.3: retry with the SAME tenant, same
    request digest, and same idempotency key — never a new one."""


class OpenParserAuthError(OpenParserError):
    """401 or 403. Spec §7.3: open the circuit for this credential; do not
    cycle through unrelated tenants."""

    def __init__(self, message: str, *, status_code: int, request_id: str | None = None) -> None:
        self.status_code = status_code
        super().__init__(message, request_id=request_id)


class OpenParserInsufficientCredits(OpenParserError):
    """402. Spec §7.3: stop new admissions for this account; surface a
    provider-capacity failure; alert the billing owner."""


class OpenParserIdempotencyConflict(OpenParserError):
    """409 idempotency_conflict — the same idempotency key was reused with
    a materially different request body. Spec §7.3: mark the local
    submission blocked and investigate request canonicalization; NEVER
    generate a new key automatically to route around this."""


class OpenParserRateLimited(OpenParserError):
    """429. Spec §7.3: honor Retry-After, apply jitter, retain the same
    idempotency key."""

    def __init__(
        self, message: str, *, retry_after_seconds: float, request_id: str | None = None
    ) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message, request_id=request_id)


class OpenParserServiceUnavailable(OpenParserError):
    """503 — an API ADMISSION dependency failure specifically (per the
    contract's own description), not general provider unavailability.
    Spec §7.3: honor Retry-After, replay with the same idempotency key."""

    def __init__(
        self, message: str, *, retry_after_seconds: float, request_id: str | None = None
    ) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message, request_id=request_id)


class OpenParserUnprocessable(OpenParserError):
    """422 — a permanent configuration/input failure unless the caller
    deliberately constructs a new input variant (spec §7.3). Carries the
    contract's own error code/details for the caller to act on."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        details: dict | None = None,
        request_id: str | None = None,
    ) -> None:
        self.code = code
        self.details = details
        super().__init__(message, request_id=request_id)


class OpenParserJobFailed(OpenParserError):
    """The provider job itself reached terminal `failed` (learned via
    poll/result, not the admission HTTP call). Spec §7.3: terminal for
    this attempt; a retry is an explicit new attempt record, never
    implicit."""


class OpenParserJobIndeterminate(OpenParserError):
    """The provider job reached terminal `indeterminate`. Spec §7.3:
    freeze automatic resubmission and alert/reconcile billing and provider
    state — human or policy resolution is required, never an automatic
    retry."""


class OpenParserResponseTooLarge(OpenParserError):
    """The response body exceeded `settings.openparser_max_response_bytes`
    — enforced via streamed reads, never by buffering the whole body
    first and checking afterward."""


class OpenParserRedirectRejected(OpenParserError):
    """A `202`'s `Location` header pointed somewhere other than the
    configured OpenParser origin. Never followed automatically — see
    client.py's own allow-list check."""
