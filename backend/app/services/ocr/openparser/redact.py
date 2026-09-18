"""
services/ocr/openparser/redact.py — header redaction for the OpenParser
client's own structured-log calls.

Multipart bodies and OCR text are never passed to a log call in the first
place (see client.py) — nothing to redact there. Headers are the one
place a secret (`Authorization`) legitimately flows through code that also
logs request metadata, so this is the one targeted redaction helper spec
§16 ("logs must not include bearer tokens... or presigned URLs") actually
requires.
"""

from __future__ import annotations

_REDACTED = "***"
_SENSITIVE_SUFFIXES = ("-key", "-token")
_SENSITIVE_EXACT = {"authorization", "idempotency-key"}


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    """Case-insensitive: masks `Authorization`, `Idempotency-Key` (an
    idempotency key is not secret in the cryptographic sense, but spec §9
    says it must never appear in visible logs either, since it's derived
    from immutable request identity), and anything ending `-key`/`-token`
    (covers a future provider-specific header without a code change)."""
    redacted: dict[str, str] = {}
    for name, value in headers.items():
        lowered = name.lower()
        if lowered in _SENSITIVE_EXACT or lowered.endswith(_SENSITIVE_SUFFIXES):
            redacted[name] = _REDACTED
        else:
            redacted[name] = value
    return redacted
