"""
services/tickets/download_ticket.py — P2 hardening (2026-09-19, F-010):
short-lived, signed, self-contained tickets that replace `?access_token=`
(the raw session JWT in a URL) for one-shot download links an `<a href>`
cannot attach an Authorization header to.

Unlike `services/ocr/openparser/idempotency.py`'s deterministic digest (a
pure function of its inputs, no state, no expiry — the right shape for
"does this request match a prior one"), a download ticket needs an
embedded expiry and needs to be independently verifiable without a DB
round trip (fast, and works even if the download happens seconds after
generation while nothing else has to query anything) — so this is a
signed payload, not a derived key.

`download_ticket_secret` is a DEDICATED secret, separate from every
other secret in this codebase (supabase_jwt_secret, internal_render_
secret, openparser_idempotency_secret) — one secret per purpose, so
rotating one never invalidates or weakens another (the same reasoning
idempotency.py's own docstring gives for its own secret).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from typing import Literal

from app.core.config import Settings

TicketKind = Literal["report", "evidence_image"]

_PREFIX = "dp1dl"


class TicketError(Exception):
    """Raised for any ticket that fails verification, for any reason —
    callers map this uniformly to 401, never leaking which specific check
    failed (expired vs. tampered vs. wrong resource), matching
    core/security.py's AuthError discipline."""


@dataclass(frozen=True)
class DownloadTicketClaims:
    resource_id: uuid.UUID
    kind: TicketKind
    issued_by: uuid.UUID


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(secret_bytes: bytes, payload_bytes: bytes) -> str:
    return hmac.new(secret_bytes, payload_bytes, hashlib.sha256).hexdigest()


def issue_download_ticket(
    settings: Settings,
    *,
    resource_id: uuid.UUID,
    kind: TicketKind,
    issued_by: uuid.UUID,
    ttl_seconds: int | None = None,
) -> str:
    if not settings.download_ticket_secret:
        raise ValueError("DOWNLOAD_TICKET_SECRET is not configured — cannot issue a download ticket")

    ttl = ttl_seconds if ttl_seconds is not None else settings.download_ticket_ttl_seconds
    payload = {
        "sub": str(resource_id),
        "kind": kind,
        "uid": str(issued_by),
        "exp": int(time.time()) + ttl,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    secret_bytes = settings.download_ticket_secret.get_secret_value().encode("utf-8")
    signature = _sign(secret_bytes, payload_bytes)
    return f"{_PREFIX}-{payload_b64}-{signature}"


def verify_download_ticket(settings: Settings, ticket: str) -> DownloadTicketClaims:
    if not settings.download_ticket_secret:
        raise TicketError("Download tickets are not configured")

    parts = ticket.split("-", 2)
    if len(parts) != 3 or parts[0] != _PREFIX:
        raise TicketError("Malformed ticket")
    _, payload_b64, signature = parts

    try:
        payload_bytes = _b64url_decode(payload_b64)
    except Exception as exc:  # noqa: BLE001 - any decode failure is just an invalid ticket
        raise TicketError("Malformed ticket") from exc

    secret_bytes = settings.download_ticket_secret.get_secret_value().encode("utf-8")
    expected_signature = _sign(secret_bytes, payload_bytes)
    if not hmac.compare_digest(expected_signature, signature):
        raise TicketError("Invalid ticket signature")

    try:
        payload = json.loads(payload_bytes)
        resource_id = uuid.UUID(payload["sub"])
        kind = payload["kind"]
        issued_by = uuid.UUID(payload["uid"])
        expires_at = int(payload["exp"])
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise TicketError("Malformed ticket payload") from exc

    if kind not in ("report", "evidence_image"):
        raise TicketError("Malformed ticket payload")

    if expires_at <= int(time.time()):
        raise TicketError("Ticket has expired")

    return DownloadTicketClaims(resource_id=resource_id, kind=kind, issued_by=issued_by)
