"""
services/ocr/openparser/worker.py — OP-Phase 3's submission and
reconciliation cycles. Each function processes ONE batch of due work and
returns; there is no infinite loop here (a scheduler/entrypoint that
calls these repeatedly is a later phase's deployment concern — this
phase only has to prove one cycle is correct and safe to call
repeatedly/concurrently, per the plan's own verification section).

Never wired into `jobs/pipeline.py`/`api/v1/scans.py` this phase (that's
Phase 5) — nothing here is imported by the running application yet.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.object_storage import get_s3_client
from app.services.ocr.openparser.artifacts import write_artifact
from app.services.ocr.openparser.errors import OpenParserError
from app.services.ocr.openparser.persistence import (
    claim_due_reconciliation_work,
    claim_due_submission_work,
    recover_stale_leases,
    transition_state,
)
from app.services.ocr.openparser.pool import OpenParserKeyPool


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _parse_iso(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@dataclass
class SubmissionCycleResult:
    claimed: int
    submitted: int
    failed: int
    recovered_leases: int


@dataclass
class ReconciliationCycleResult:
    claimed: int
    polled: int
    completed: int
    failed: int
    recovered_leases: int


def run_submission_cycle(
    db: Session,
    pool: OpenParserKeyPool,
    settings: Settings,
    *,
    worker_id: str,
    batch_size: int = 10,
    lease_seconds: int = 60,
) -> SubmissionCycleResult:
    """`recover_stale_leases` runs first so a crashed prior worker's
    `submitting` rows are eligible for THIS claim. Each claimed row is
    processed and committed individually — one row's failure (a bad image,
    a transient provider error) never blocks the rest of the batch."""
    s3_client = get_s3_client(settings)
    recovered = recover_stale_leases(db)
    db.commit()

    claimed = claim_due_submission_work(
        db, worker_id=worker_id, lease_seconds=lease_seconds, limit=batch_size
    )
    db.commit()

    submitted = 0
    failed = 0
    for job in claimed:
        try:
            obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=job.input_storage_key)
            file_bytes = obj["Body"].read()
            filename = job.input_storage_key.rsplit("/", 1)[-1]
            accepted = pool.submit_parse_async(
                file_bytes=file_bytes,
                filename=filename,
                content_type=job.input_media_type,
                idempotency_key=job.idempotency_key,
                ocr_model=job.model_id,
                output_format=job.output_format,
            )
        except OpenParserError as exc:
            transition_state(
                db,
                job,
                expected_from="submitting",
                to="failed",
                last_error_message=str(exc)[:500],
                submission_lease_owner=None,
                submission_lease_expires_at=None,
            )
            db.commit()
            failed += 1
            continue

        ok = transition_state(
            db,
            job,
            expected_from="submitting",
            to="submitted",
            provider_job_id=accepted.id,
            provider_key_alias=pool.key_alias_for(accepted.id),
            last_provider_state=accepted.status,
            next_poll_at=_now()
            + datetime.timedelta(seconds=settings.openparser_poll_min_seconds),
            submission_lease_owner=None,
            submission_lease_expires_at=None,
        )
        db.commit()
        if ok:
            submitted += 1

    return SubmissionCycleResult(
        claimed=len(claimed), submitted=submitted, failed=failed, recovered_leases=recovered
    )


def run_reconciliation_cycle(
    db: Session,
    pool: OpenParserKeyPool,
    settings: Settings,
    *,
    worker_id: str,
    batch_size: int = 10,
    lease_seconds: int = 60,
) -> ReconciliationCycleResult:
    """Polls each claimed in-flight row through the key alias PERSISTED on
    the row (`get_job_via_alias`), not the pool's own in-memory pin — this
    is what makes reconciliation survive a process restart, closing the
    pool's own disclosed limitation (pool.py's module docstring)."""
    s3_client = get_s3_client(settings)
    recovered = recover_stale_leases(db)
    db.commit()

    claimed = claim_due_reconciliation_work(
        db, worker_id=worker_id, lease_seconds=lease_seconds, limit=batch_size
    )
    db.commit()

    polled = 0
    completed = 0
    failed = 0
    for job in claimed:
        try:
            provider_job = pool.get_job_via_alias(job.provider_key_alias, job.provider_job_id)
        except OpenParserError as exc:
            transition_state(
                db,
                job,
                expected_from=job.local_state,
                to=job.local_state,
                last_error_message=str(exc)[:500],
                reconciliation_lease_owner=None,
                reconciliation_lease_expires_at=None,
            )
            db.commit()
            continue

        status = provider_job.status
        polled += 1

        if status in ("queued", "running"):
            transition_state(
                db,
                job,
                expected_from=job.local_state,
                to=status,
                last_provider_state=status,
                poll_count=job.poll_count + 1,
                next_poll_at=_now()
                + datetime.timedelta(seconds=settings.openparser_poll_min_seconds),
                reconciliation_lease_owner=None,
                reconciliation_lease_expires_at=None,
            )
            db.commit()
            continue

        if status == "succeeded":
            result = pool.get_job_result_via_alias(
                job.provider_key_alias, job.provider_job_id, format="openparser@1"
            )
            canonical_bytes = result.model_dump_json().encode("utf-8")
            ref = write_artifact(
                s3_client,
                settings,
                job_id=str(job.id),
                kind="canonical-result",
                content_type="application/json",
                data=canonical_bytes,
            )
            ok = transition_state(
                db,
                job,
                expected_from=job.local_state,
                to="artifacts_stored",
                last_provider_state=status,
                poll_count=job.poll_count + 1,
                provider_completed_at=_parse_iso(provider_job.completed_at),
                canonical_result_storage_key=ref.storage_key,
                canonical_result_sha256=ref.sha256,
                canonical_result_byte_count=ref.byte_count,
                reconciliation_lease_owner=None,
                reconciliation_lease_expires_at=None,
                next_poll_at=None,
            )
            db.commit()
            if ok:
                completed += 1
            continue

        # failed / indeterminate — both locally terminal for reconciliation.
        transition_state(
            db,
            job,
            expected_from=job.local_state,
            to=status,
            last_provider_state=status,
            poll_count=job.poll_count + 1,
            provider_completed_at=_parse_iso(provider_job.completed_at),
            last_error_code=provider_job.error.code if provider_job.error else None,
            last_error_message=provider_job.error.message if provider_job.error else None,
            reconciliation_lease_owner=None,
            reconciliation_lease_expires_at=None,
            next_poll_at=None,
        )
        db.commit()
        failed += 1

    return ReconciliationCycleResult(
        claimed=len(claimed),
        polled=polled,
        completed=completed,
        failed=failed,
        recovered_leases=recovered,
    )
