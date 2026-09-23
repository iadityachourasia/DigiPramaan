"""
services/ocr/openparser/idempotency.py — OP-Phase 3's deterministic
`Idempotency-Key` derivation (spec §9). A pure function: no DB access, no
I/O, so it's testable without a database and safe to call before any row
is written (the canonical request digest is persisted first, per §9's
own "persist the canonical request JSON digest before sending any
bytes").

Deliberately HMAC'd with `openparser_idempotency_secret` — a secret
SEPARATE from the OpenParser API key (see that setting's own docstring
in core/config.py) — so a provider key rotation can never change what a
replayed submission resolves to, and this secret is never sent to
OpenParser at all.

The visible key never contains PII, filenames, OCR text, or the secret
itself — only UUIDs, a hex digest, and a small set of identifiers already
safe to log (model id, profile version).
"""

from __future__ import annotations

import hashlib
import hmac

from app.core.config import Settings

_PREFIX = "digipramaan|openparser|parse|v1"


def derive_idempotency_key(
    settings: Settings,
    *,
    scan_id: str,
    image_id: str,
    input_sha256: str,
    model: str,
    profile_version: str,
    canonical_request_sha256: str,
    attempt: int,
) -> str:
    """Deterministic for identical inputs; any changed input (a different
    image, a different model/profile, a different canonical request, or a
    new attempt number) yields a different key — per §9, that's what makes
    it "a different request," never a mutation of a prior one."""
    if not settings.openparser_idempotency_secret:
        raise ValueError(
            "OPENPARSER_IDEMPOTENCY_SECRET is not configured — cannot derive an "
            "idempotency key without it"
        )
    material = (
        f"{_PREFIX}|scan={scan_id}|image={image_id}|input={input_sha256}|"
        f"model={model}|profile={profile_version}|request={canonical_request_sha256}|"
        f"attempt={attempt}"
    )
    secret = settings.openparser_idempotency_secret.get_secret_value().encode("utf-8")
    digest = hmac.new(secret, material.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"dp1-{digest}"
