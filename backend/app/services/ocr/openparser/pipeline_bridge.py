"""
services/ocr/openparser/pipeline_bridge.py — OP-Phase 5's ONLY new file:
wires the already-built config/client/pool (Phase 2), persistence/worker
(Phase 3), and normalize/legacy-compat (Phase 4) pieces into
`app/jobs/pipeline.py`'s `textExtraction` stage, producing the exact same
`list[OcrBlock]` shape the existing Paddle path already produces — so
every downstream consumer (Gemini structuring, rules, reports) needs zero
changes; the contract boundary is exactly `list[OcrBlock]`.

`local_paddle` mode never calls anything in this file — `pipeline.py`'s
existing Paddle branch is untouched, byte for byte. This file only runs
under `ocr_provider in ("openparser", "openparser_shadow")`.
"""

from __future__ import annotations

import json
import time
import uuid

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import EvidenceImage, OcrProviderJob
from app.services.ocr.openparser.artifacts import write_artifact
from app.services.ocr.openparser.idempotency import derive_idempotency_key
from app.services.ocr.openparser.normalize import (
    NORMALIZATION_ADAPTER_VERSION,
    OcrElement,
    normalize_parsed_document,
    to_legacy_ocr_block,
)
from app.services.ocr.openparser.normalized_schemas import ParsedDocumentStrict
from app.services.ocr.openparser.persistence import create_job_intent, transition_state
from app.services.ocr.openparser.pool import OpenParserKeyPool
from app.services.ocr.openparser.worker import run_reconciliation_cycle, run_submission_cycle
from app.services.ocr.provider import OcrBlock

_CONTENT_TYPE_BY_EXTENSION = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
}

_TERMINAL_STATES = frozenset({"artifacts_stored", "normalized", "failed", "indeterminate"})
_FAILURE_STATES = frozenset({"failed", "indeterminate"})


class OpenParserPipelineTimeout(Exception):
    """Raised when a scan's OpenParser jobs don't reach a terminal state
    within `openparser_job_max_age_seconds`. Caught by the SAME
    `try/except Exception` pipeline.py's pending branch already wraps the
    Paddle loop in — same error shape, same retry story, no new
    error-handling path in pipeline.py itself."""


class OpenParserPipelineFailure(Exception):
    """Raised when any image's OpenParser job reaches a terminal failure
    state (`failed`/`indeterminate`) — matches today's Paddle behavior,
    where any one image's OCR exception fails the whole stage."""


def _media_type_for(storage_key: str) -> str:
    extension = storage_key.rsplit(".", 1)[-1].lower() if "." in storage_key else ""
    return _CONTENT_TYPE_BY_EXTENSION.get(extension, "application/octet-stream")


def _canonical_request_sha256(settings: Settings, model_id: str | None = None) -> str:
    import hashlib

    material = json.dumps(
        {
            "model": model_id or settings.openparser_ocr_model,
            "profile_version": settings.openparser_quality_profile,
            "output_format": "openparser@1",
        },
        sort_keys=True,
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _get_or_create_job_intent(
    db: Session, settings: Settings, session, evidence_image: EvidenceImage, s3_client
) -> OcrProviderJob:
    """Query-first: a retried `textExtraction` stage re-enters here and
    finds the SAME row (any local_state) rather than creating a duplicate
    — this is what makes the stage's retry idempotent. Always
    `attempt_number=1` this phase (see module docstring's scope note)."""
    profile_version = settings.openparser_quality_profile
    input_sha256 = evidence_image.content_hash or ""

    existing = (
        db.query(OcrProviderJob)
        .filter(
            OcrProviderJob.evidence_image_id == evidence_image.id,
            OcrProviderJob.profile_version == profile_version,
            OcrProviderJob.input_sha256 == input_sha256,
            OcrProviderJob.attempt_number == 1,
        )
        .first()
    )
    if existing is not None:
        return existing

    quality = evidence_image.quality_result or {}
    input_width_px = quality.get("width") or None
    input_height_px = quality.get("height") or None

    head = s3_client.head_object(Bucket=settings.s3_bucket, Key=evidence_image.storage_key)
    input_byte_count = int(head["ContentLength"])

    canonical_request_sha256 = _canonical_request_sha256(settings)
    idempotency_key = derive_idempotency_key(
        settings,
        scan_id=str(session.id),
        image_id=str(evidence_image.id),
        input_sha256=input_sha256,
        model=settings.openparser_ocr_model,
        profile_version=profile_version,
        canonical_request_sha256=canonical_request_sha256,
        attempt=1,
    )

    job = create_job_intent(
        db,
        scan_session_id=session.id,
        evidence_image_id=evidence_image.id,
        angle=evidence_image.angle,
        provider="openparser",
        operation="parse_single",
        idempotency_key=idempotency_key,
        canonical_request_sha256=canonical_request_sha256,
        model_id=settings.openparser_ocr_model,
        output_format="openparser@1",
        profile_version=profile_version,
        input_storage_key=evidence_image.storage_key,
        input_sha256=input_sha256,
        input_byte_count=input_byte_count,
        input_media_type=_media_type_for(evidence_image.storage_key),
        provider_tenant_alias=settings.openparser_tenant_alias,
        input_width_px=input_width_px,
        input_height_px=input_height_px,
        attempt_number=1,
    )
    db.commit()
    return job


def _get_or_create_escalation_job_intent(
    db: Session, settings: Settings, session, evidence_image: EvidenceImage, s3_client,
    *, model_id: str, retry_reason: str, parent_job: OcrProviderJob,
) -> OcrProviderJob:
    """Near-copy of `_get_or_create_job_intent`, but for a second (or
    third) opinion on an image that already has a primary
    (`attempt_number=1`) job — used only by the post-structuring
    escalation path (`run_openparser_escalation_extraction`), never by the
    forward/resume text-extraction entrypoints above. `attempt_number` is
    `parent_job.attempt_number + 1`, so a tier-2 escalation building on a
    tier-1 escalation's own miss naturally lands at 3, not a hardcoded 2 —
    `uq_ocr_provider_jobs_attempt`'s unique index on `(evidence_image_id,
    profile_version, input_sha256, attempt_number)` is exactly why this
    must never collide with an existing attempt for the same image."""
    attempt_number = parent_job.attempt_number + 1
    profile_version = settings.openparser_quality_profile
    input_sha256 = evidence_image.content_hash or ""

    existing = (
        db.query(OcrProviderJob)
        .filter(
            OcrProviderJob.evidence_image_id == evidence_image.id,
            OcrProviderJob.profile_version == profile_version,
            OcrProviderJob.input_sha256 == input_sha256,
            OcrProviderJob.attempt_number == attempt_number,
        )
        .first()
    )
    if existing is not None:
        return existing

    quality = evidence_image.quality_result or {}
    input_width_px = quality.get("width") or None
    input_height_px = quality.get("height") or None

    head = s3_client.head_object(Bucket=settings.s3_bucket, Key=evidence_image.storage_key)
    input_byte_count = int(head["ContentLength"])

    canonical_request_sha256 = _canonical_request_sha256(settings, model_id)
    idempotency_key = derive_idempotency_key(
        settings,
        scan_id=str(session.id),
        image_id=str(evidence_image.id),
        input_sha256=input_sha256,
        model=model_id,
        profile_version=profile_version,
        canonical_request_sha256=canonical_request_sha256,
        attempt=attempt_number,
    )

    job = create_job_intent(
        db,
        scan_session_id=session.id,
        evidence_image_id=evidence_image.id,
        angle=evidence_image.angle,
        provider="openparser",
        operation="parse_single",
        idempotency_key=idempotency_key,
        canonical_request_sha256=canonical_request_sha256,
        model_id=model_id,
        output_format="openparser@1",
        profile_version=profile_version,
        input_storage_key=evidence_image.storage_key,
        input_sha256=input_sha256,
        input_byte_count=input_byte_count,
        input_media_type=_media_type_for(evidence_image.storage_key),
        provider_tenant_alias=settings.openparser_tenant_alias,
        input_width_px=input_width_px,
        input_height_px=input_height_px,
        attempt_number=attempt_number,
        retry_reason=retry_reason,
        parent_attempt_id=parent_job.id,
    )
    db.commit()
    return job


def _jobs_for_scan(db: Session, scan_session_id: uuid.UUID) -> list[OcrProviderJob]:
    return (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.scan_session_id == scan_session_id, OcrProviderJob.provider == "openparser")
        .all()
    )


def _drive_to_terminal(
    db: Session, pool: OpenParserKeyPool, settings: Settings, scan_session_id: uuid.UUID
) -> None:
    """Bounded synchronous poll loop — consistent with this codebase's
    existing sync-everywhere philosophy (Paddle already blocks a
    BackgroundTask for 70-90s per image; this is the same shape, not a
    new one). Raises `OpenParserPipelineTimeout` if the age budget is
    exceeded before every row for this scan reaches a terminal state."""
    worker_id = f"pipeline-{scan_session_id}"
    deadline = time.monotonic() + settings.openparser_job_max_age_seconds

    run_submission_cycle(db, pool, settings, worker_id=worker_id)

    while True:
        jobs = _jobs_for_scan(db, scan_session_id)
        if jobs and all(job.local_state in _TERMINAL_STATES for job in jobs):
            return
        if time.monotonic() >= deadline:
            raise OpenParserPipelineTimeout(
                f"OpenParser jobs for scan {scan_session_id} did not reach a terminal state "
                f"within {settings.openparser_job_max_age_seconds}s"
            )
        run_reconciliation_cycle(db, pool, settings, worker_id=worker_id)
        time.sleep(settings.openparser_poll_min_seconds)


def _jobs_by_ids(db: Session, job_ids: list[uuid.UUID]) -> list[OcrProviderJob]:
    return db.query(OcrProviderJob).filter(OcrProviderJob.id.in_(job_ids)).all()


def _drive_jobs_to_terminal(
    db: Session, pool: OpenParserKeyPool, settings: Settings, job_ids: list[uuid.UUID]
) -> None:
    """Job-id-scoped sibling of `_drive_to_terminal` — used by escalation,
    which must never re-poll/re-normalize the scan's already-terminal
    primary (`attempt_number=1`) jobs. `run_submission_cycle`/
    `run_reconciliation_cycle` are global work-queue drains (claim
    whatever's due via `SELECT ... FOR UPDATE SKIP LOCKED`, per this
    package's own module docstring) — same pattern `_drive_to_terminal`
    already relies on, just checked against this specific job-id set
    instead of "every job for this scan"."""
    worker_id = f"escalation-{job_ids[0]}"
    deadline = time.monotonic() + settings.openparser_job_max_age_seconds

    run_submission_cycle(db, pool, settings, worker_id=worker_id)

    while True:
        jobs = _jobs_by_ids(db, job_ids)
        if jobs and all(job.local_state in _TERMINAL_STATES for job in jobs):
            return
        if time.monotonic() >= deadline:
            raise OpenParserPipelineTimeout(
                f"Escalation OpenParser jobs {job_ids} did not reach a terminal state "
                f"within {settings.openparser_job_max_age_seconds}s"
            )
        run_reconciliation_cycle(db, pool, settings, worker_id=worker_id)
        time.sleep(settings.openparser_poll_min_seconds)


def _normalize_terminal_job(s3_client, settings: Settings, job: OcrProviderJob) -> list[OcrElement]:
    if job.local_state in _FAILURE_STATES:
        raise OpenParserPipelineFailure(
            f"OpenParser job {job.id} for image {job.evidence_image_id} ended {job.local_state}: "
            f"{job.last_error_message or 'no error detail recorded'}"
        )

    if job.canonical_result_storage_key is None:
        raise OpenParserPipelineFailure(
            f"OpenParser job {job.id} has no canonical result artifact to normalize"
        )

    obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=job.canonical_result_storage_key)
    raw = json.loads(obj["Body"].read())
    document = ParsedDocumentStrict.model_validate(raw)

    return normalize_parsed_document(document, job=job)


def _finish_normalization(
    db: Session, s3_client, settings: Settings, jobs: list[OcrProviderJob]
) -> tuple[list[OcrBlock], dict[str, str]]:
    all_blocks: list[OcrBlock] = []
    angle_by_image_id: dict[str, str] = {}
    for job in jobs:
        elements = _normalize_terminal_job(s3_client, settings, job)
        blocks = [block for element in elements if (block := to_legacy_ocr_block(element)) is not None]
        all_blocks.extend(blocks)
        angle_by_image_id[str(job.evidence_image_id)] = job.angle

        if job.local_state == "artifacts_stored":
            # Spec §12.1 item 5: write the normalized output as its own
            # versioned artifact, then transition — the CHECK constraint
            # `ck_ocr_provider_jobs_normalized_requires_artifact` (Phase 3)
            # enforces exactly this ordering at the DB level.
            normalized_json = json.dumps(
                [element.model_dump(mode="json") for element in elements]
            ).encode("utf-8")
            ref = write_artifact(
                s3_client, settings, job_id=str(job.id), kind="normalized",
                content_type="application/json", data=normalized_json,
            )
            transition_state(
                db, job, expected_from="artifacts_stored", to="normalized",
                normalization_adapter_version=NORMALIZATION_ADAPTER_VERSION,
                normalized_artifact_storage_key=ref.storage_key,
                normalized_artifact_sha256=ref.sha256,
            )
            db.commit()
    return all_blocks, angle_by_image_id


def run_openparser_text_extraction(
    db: Session,
    settings: Settings,
    pool: OpenParserKeyPool,
    session,
    images: list[EvidenceImage],
    s3_client,
) -> tuple[list[OcrBlock], dict[str, str]]:
    """The forward-path entrypoint `pipeline.py` calls for a brand-new
    (`pending`) `textExtraction` stage under `openparser`/
    `openparser_shadow` mode."""
    jobs = [_get_or_create_job_intent(db, settings, session, image, s3_client) for image in images]
    _drive_to_terminal(db, pool, settings, session.id)
    return _finish_normalization(db, s3_client, settings, jobs)


def resume_openparser_text_extraction(
    db: Session, settings: Settings, pool: OpenParserKeyPool, session, s3_client
) -> tuple[list[OcrBlock], dict[str, str]]:
    """The resume-path entrypoint: `textExtraction` was already marked
    `completed` in an earlier `run_pipeline` call. Re-normalizes directly
    from each job's ALREADY-stored artifact — no provider call, no
    resubmission — unless a row is genuinely still in flight (process
    died mid-poll), in which case it's driven to terminal first via the
    same idempotency-keyed rows (never a duplicate admission)."""
    jobs = _jobs_for_scan(db, session.id)
    if not jobs or not all(job.local_state in _TERMINAL_STATES for job in jobs):
        _drive_to_terminal(db, pool, settings, session.id)
        jobs = _jobs_for_scan(db, session.id)
    return _finish_normalization(db, s3_client, settings, jobs)


def run_openparser_escalation_extraction(
    db: Session,
    settings: Settings,
    pool: OpenParserKeyPool,
    session,
    images: list[EvidenceImage],
    s3_client,
    *,
    model_id: str,
    target_image_ids: set[str],
    retry_reason: str,
) -> tuple[list[OcrBlock], dict[str, str]]:
    """The escalation entrypoint — a second (or third) OCR opinion on a
    SUBSET of a scan's images, using a different `model_id` than the
    primary pass. Never called for a brand-new scan; only from
    `jobs/pipeline.py`'s post-structuring escalation branch, after the
    primary `attempt_number=1` pass has already completed and structuring
    has already run once. Requires each target image to already have a
    terminal primary job (its own `parent_job`) — this function does not
    create a primary job itself, it only ever adds a later attempt on top
    of one that already exists."""
    targets = [image for image in images if str(image.id) in target_image_ids]
    primary_jobs_by_image = {
        job.evidence_image_id: job
        for job in _jobs_for_scan(db, session.id)
        if job.attempt_number == 1 and str(job.evidence_image_id) in target_image_ids
    }

    jobs: list[OcrProviderJob] = []
    for image in targets:
        parent_job = primary_jobs_by_image.get(image.id)
        if parent_job is None:
            # No terminal primary job for this image (shouldn't happen —
            # every image gets a primary attempt before structuring ever
            # runs) — skip rather than fabricate a parent lineage.
            continue
        jobs.append(
            _get_or_create_escalation_job_intent(
                db, settings, session, image, s3_client,
                model_id=model_id, retry_reason=retry_reason, parent_job=parent_job,
            )
        )

    if not jobs:
        return [], {}

    _drive_jobs_to_terminal(db, pool, settings, [job.id for job in jobs])
    return _finish_normalization(db, s3_client, settings, jobs)
