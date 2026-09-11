"""
services/mobile_handoff/tokens.py — the one place a handoff token is
generated or hashed.

The raw token is a bearer credential: whoever holds it can upload images
into exactly one scan session until it expires, is completed, or is
revoked. It is returned to the officer's desktop exactly once (the
handoff-creation response) and is never persisted anywhere — only its
sha256 hash lives in `mobile_upload_sessions.token_hash`. Never log the
raw token or pass it into an AuditEvent's `detail`.
"""

from __future__ import annotations

import hashlib
import secrets

# 32 bytes = 256 bits of entropy, URL-safe (the token travels inside a
# path segment: /mobile-capture/{token}).
_TOKEN_BYTES = 32


def generate_token() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
