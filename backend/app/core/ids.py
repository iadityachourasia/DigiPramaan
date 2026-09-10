"""
ids.py — deterministic id derivation shared across the scan API and the
pipeline runner.

The frontend's PipelineRun.recordId is non-nullable — it must be present
from the very first poll, even before a provisional ComplianceRecord
actually exists (extraction hasn't run yet). Deriving it deterministically
from the scan_session id (rather than generating a random UUID and storing
it early) means both the API route and the pipeline runner compute the
IDENTICAL value independently, with nothing to keep in sync — and
`compliance_records.id` is only ever actually inserted with this same value
once the record genuinely exists.
"""

from __future__ import annotations

import uuid


def derive_record_id(scan_session_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"digipramaan-scan-session:{scan_session_id}")
