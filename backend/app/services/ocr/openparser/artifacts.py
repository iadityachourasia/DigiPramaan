"""
services/ocr/openparser/artifacts.py — the immutable artifact writer for
OP-Phase 3. Reuses `get_s3_client`/the existing B2-via-S3-API bucket
exactly as every other caller in this codebase does (`scans.py`'s own
`put_object` call is the direct precedent) — no new storage abstraction.

Content-addressed keys (`ocr-artifacts/{job_id}/{kind}-{sha256[:12]}.*`)
make the writer naturally non-overwriting: identical bytes always
resolve to the identical key, so a retried write of the SAME result is a
harmless no-op PUT, never a silent overwrite. A genuinely different
result only ever comes from a new attempt, which has its own `job_id` —
so two different bytes never collide on one key.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class ArtifactRef:
    storage_key: str
    sha256: str
    byte_count: int


_EXTENSION_BY_CONTENT_TYPE = {
    "application/json": "json",
}


def write_artifact(
    s3_client,
    settings,
    *,
    job_id: str,
    kind: str,
    content_type: str,
    data: bytes,
) -> ArtifactRef:
    """`kind` is a short label (e.g. "canonical-result", "raw-result") —
    it appears in the storage key, never in a log line with the bytes
    themselves. Returns the ref the caller persists onto the
    `OcrProviderJob` row (`canonical_result_storage_key`/`_sha256`/
    `_byte_count`, or the raw/normalized equivalents)."""
    digest = hashlib.sha256(data).hexdigest()
    extension = _EXTENSION_BY_CONTENT_TYPE.get(content_type, "bin")
    storage_key = f"ocr-artifacts/{job_id}/{kind}-{digest[:12]}.{extension}"
    s3_client.put_object(
        Bucket=settings.s3_bucket, Key=storage_key, Body=data, ContentType=content_type
    )
    return ArtifactRef(storage_key=storage_key, sha256=digest, byte_count=len(data))
