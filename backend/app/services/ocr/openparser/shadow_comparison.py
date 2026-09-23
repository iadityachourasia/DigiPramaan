"""
services/ocr/openparser/shadow_comparison.py — OP-Phase 7's comparison
harness. Purely read-only reporting over data OP-Phase 5 already
produces when `OCR_PROVIDER=openparser_shadow`: it never calls
OpenParser or Gemini itself, only reads already-persisted
`ComplianceRecord.evidence_bundle["ocr_blocks"]` (the Paddle side) and
already-persisted `OcrProviderJob` rows + their stored artifacts (the
OpenParser side).

Not exposed anywhere officers can see (no API route, no UI) — spec's own
"do not expose shadow results to officers as authoritative."

Honest scope limits, not gaps this module silently papers over:
- `OcrProviderJob.cost_usage` is never populated by the OP-Phase-3 worker
  (the OpenParser `Job` schema carries no cost field) — cost is reported
  as unavailable, never fabricated.
- Paddle's own OCR duration is only ever printed (`pipeline.py`'s
  `[OCR-TIMING]` line), never persisted — so a true Paddle-vs-OpenParser
  LATENCY comparison isn't possible from existing data; only the
  OpenParser side's duration is reported.
- No field-level (structured-extraction) comparison — that would need a
  second live Gemini call over OpenParser's blocks, out of scope for a
  harness that makes no external call at all.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import ComplianceRecord, OcrProviderJob, ScanSession
from app.services.ocr.openparser.normalize import OcrElement

_TERMINAL_SUCCESS_STATES = frozenset({"artifacts_stored", "normalized"})


class ShadowComparisonRow:
    """One evidence image's Paddle-vs-OpenParser(shadow) comparison. Not a
    Pydantic model — deliberately plain, since half its fields are
    legitimately absent (`None`) rather than validated-required, and this
    is an internal reporting shape, never serialized over an API."""

    def __init__(
        self,
        *,
        scan_session_id: uuid.UUID,
        evidence_image_id: uuid.UUID,
        angle: str,
        paddle_block_count: int,
        openparser_local_state: str,
        openparser_element_count: int | None,
        openparser_elements_with_confidence: int | None,
        openparser_elements_missing_confidence: int | None,
        openparser_poll_count: int,
        openparser_duration_ms: float | None,
        openparser_last_error_code: str | None,
        openparser_last_error_message: str | None,
    ) -> None:
        self.scan_session_id = scan_session_id
        self.evidence_image_id = evidence_image_id
        self.angle = angle
        self.paddle_block_count = paddle_block_count
        self.openparser_local_state = openparser_local_state
        self.openparser_element_count = openparser_element_count
        self.openparser_elements_with_confidence = openparser_elements_with_confidence
        self.openparser_elements_missing_confidence = openparser_elements_missing_confidence
        self.openparser_poll_count = openparser_poll_count
        self.openparser_duration_ms = openparser_duration_ms
        self.openparser_last_error_code = openparser_last_error_code
        self.openparser_last_error_message = openparser_last_error_message


class ShadowComparisonSummary:
    def __init__(
        self,
        *,
        row_count: int,
        terminal_success_rate: float,
        mean_paddle_block_count: float | None,
        mean_openparser_element_count: float | None,
        missing_confidence_rate: float | None,
        mean_poll_count: float | None,
        mean_duration_ms: float | None,
        cost_data_available: bool = False,
        paddle_latency_available: bool = False,
    ) -> None:
        self.row_count = row_count
        self.terminal_success_rate = terminal_success_rate
        self.mean_paddle_block_count = mean_paddle_block_count
        self.mean_openparser_element_count = mean_openparser_element_count
        self.missing_confidence_rate = missing_confidence_rate
        self.mean_poll_count = mean_poll_count
        self.mean_duration_ms = mean_duration_ms
        self.cost_data_available = cost_data_available
        self.paddle_latency_available = paddle_latency_available


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _openparser_duration_ms(job: OcrProviderJob) -> float | None:
    started = job.provider_created_at
    completed = job.provider_completed_at
    if started is None or completed is None:
        return None
    return (completed - started).total_seconds() * 1000.0


def _load_normalized_elements(s3_client, settings: Settings, job: OcrProviderJob) -> list[OcrElement] | None:
    if job.normalized_artifact_storage_key is None:
        return None
    obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=job.normalized_artifact_storage_key)
    raw = json.loads(obj["Body"].read())
    return [OcrElement.model_validate(item) for item in raw]


def _paddle_block_counts_by_image(record: ComplianceRecord | None) -> dict[str, int]:
    if record is None or not record.evidence_bundle:
        return {}
    counts: dict[str, int] = {}
    for block in record.evidence_bundle.get("ocr_blocks", []):
        image_id = block.get("image_id")
        if image_id is not None:
            counts[image_id] = counts.get(image_id, 0) + 1
    return counts


def build_shadow_comparison_rows(
    db: Session, s3_client, settings: Settings, scan_session_id: uuid.UUID
) -> list[ShadowComparisonRow]:
    """One row per evidence image that has a shadow `OcrProviderJob` row.
    A scan with no shadow rows (e.g. `ocr_provider` was never
    `openparser_shadow`/`openparser` for it) returns an empty list —
    never an error, since "no shadow data yet" is an expected state for
    the vast majority of scans while `ocr_provider` defaults to
    `local_paddle`."""
    session = db.get(ScanSession, scan_session_id)
    record = db.get(ComplianceRecord, session.record_id) if session and session.record_id else None
    paddle_counts = _paddle_block_counts_by_image(record)

    jobs = (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.scan_session_id == scan_session_id, OcrProviderJob.provider == "openparser")
        .all()
    )

    rows: list[ShadowComparisonRow] = []
    for job in jobs:
        element_count = elements_with_confidence = elements_missing_confidence = None
        if job.local_state in _TERMINAL_SUCCESS_STATES:
            elements = _load_normalized_elements(s3_client, settings, job)
            if elements is not None:
                element_count = len(elements)
                elements_with_confidence = sum(1 for e in elements if e.confidence is not None)
                elements_missing_confidence = element_count - elements_with_confidence

        rows.append(
            ShadowComparisonRow(
                scan_session_id=scan_session_id,
                evidence_image_id=job.evidence_image_id,
                angle=job.angle,
                paddle_block_count=paddle_counts.get(str(job.evidence_image_id), 0),
                openparser_local_state=job.local_state,
                openparser_element_count=element_count,
                openparser_elements_with_confidence=elements_with_confidence,
                openparser_elements_missing_confidence=elements_missing_confidence,
                openparser_poll_count=job.poll_count,
                openparser_duration_ms=_openparser_duration_ms(job),
                openparser_last_error_code=job.last_error_code,
                openparser_last_error_message=job.last_error_message,
            )
        )
    return rows


def summarize_shadow_comparison(rows: list[ShadowComparisonRow]) -> ShadowComparisonSummary:
    if not rows:
        return ShadowComparisonSummary(
            row_count=0, terminal_success_rate=0.0, mean_paddle_block_count=None,
            mean_openparser_element_count=None, missing_confidence_rate=None,
            mean_poll_count=None, mean_duration_ms=None,
        )

    successes = [r for r in rows if r.openparser_local_state in _TERMINAL_SUCCESS_STATES]
    element_counts = [r.openparser_element_count for r in successes if r.openparser_element_count is not None]
    with_conf = sum(r.openparser_elements_with_confidence or 0 for r in successes)
    missing_conf = sum(r.openparser_elements_missing_confidence or 0 for r in successes)
    total_conf_known = with_conf + missing_conf
    durations = [r.openparser_duration_ms for r in rows if r.openparser_duration_ms is not None]

    return ShadowComparisonSummary(
        row_count=len(rows),
        terminal_success_rate=len(successes) / len(rows),
        mean_paddle_block_count=sum(r.paddle_block_count for r in rows) / len(rows),
        mean_openparser_element_count=(sum(element_counts) / len(element_counts)) if element_counts else None,
        missing_confidence_rate=(missing_conf / total_conf_known) if total_conf_known else None,
        mean_poll_count=sum(r.openparser_poll_count for r in rows) / len(rows),
        mean_duration_ms=(sum(durations) / len(durations)) if durations else None,
    )
