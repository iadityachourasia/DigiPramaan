"""
services/ocr/openparser/persistence.py — OP-Phase 3's repository layer
over `ocr_provider_jobs`. Every state change goes through
`transition_state()` (a compare-and-set `UPDATE ... WHERE id=:id AND
local_state=:expected`, never a bare assignment-then-commit) so two
workers racing on the same stale lease can never both apply their
result — see the model's own module docstring for the full rationale.

Claiming uses real row locks (`SELECT ... FOR UPDATE SKIP LOCKED`), the
first use of that pattern in this codebase (the only prior precedent,
`services/authz/repositories.py`, uses a plain `FOR UPDATE` for a single
row a request already knows the id of — this module claims a BATCH of
rows no caller has IDs for yet, which is exactly what `SKIP LOCKED` is
for: two workers polling concurrently must partition the due rows
between them, not block on each other).
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models.ocr_provider_job import OcrProviderJob


class StaleStateError(Exception):
    """Raised by a caller that needs to distinguish "lost the CAS race, the
    row moved under us" from a genuine bug — `transition_state()` itself
    just returns `False` and leaves that judgment to the caller."""


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def create_job_intent(
    db: Session,
    *,
    scan_session_id: uuid.UUID,
    evidence_image_id: uuid.UUID,
    angle: str,
    provider: str,
    operation: str,
    idempotency_key: str,
    canonical_request_sha256: str,
    model_id: str,
    output_format: str,
    profile_version: str,
    input_storage_key: str,
    input_sha256: str,
    input_byte_count: int,
    input_media_type: str,
    provider_tenant_alias: str | None = None,
    provider_key_alias: str | None = None,
    client_item_id: str | None = None,
    provider_batch_id: str | None = None,
    options_snapshot: dict | None = None,
    catalog_snapshot_hash: str | None = None,
    input_width_px: int | None = None,
    input_height_px: int | None = None,
    attempt_number: int = 1,
    retry_reason: str | None = None,
    parent_attempt_id: uuid.UUID | None = None,
) -> OcrProviderJob:
    """Inserts one row in `pending_submission`. The caller's own
    transaction (the scan/job-intent transaction, per spec §8: "the
    transaction that creates a scan/job intent must also create the work
    item") is what commits it — this function only flushes, never
    commits, so it composes into a larger unit of work."""
    job = OcrProviderJob(
        scan_session_id=scan_session_id,
        evidence_image_id=evidence_image_id,
        angle=angle,
        provider=provider,
        provider_tenant_alias=provider_tenant_alias,
        provider_key_alias=provider_key_alias,
        provider_batch_id=provider_batch_id,
        client_item_id=client_item_id,
        local_state="pending_submission",
        operation=operation,
        idempotency_key=idempotency_key,
        canonical_request_sha256=canonical_request_sha256,
        model_id=model_id,
        output_format=output_format,
        options_snapshot=options_snapshot or {},
        profile_version=profile_version,
        catalog_snapshot_hash=catalog_snapshot_hash,
        input_storage_key=input_storage_key,
        input_sha256=input_sha256,
        input_byte_count=input_byte_count,
        input_width_px=input_width_px,
        input_height_px=input_height_px,
        input_media_type=input_media_type,
        attempt_number=attempt_number,
        retry_reason=retry_reason,
        parent_attempt_id=parent_attempt_id,
    )
    db.add(job)
    db.flush()
    return job


def transition_state(
    db: Session, job: OcrProviderJob, *, expected_from: str, to: str, **updates: Any
) -> bool:
    """Compare-and-set on `local_state`. Returns `False` (changes nothing)
    if `job.local_state` is no longer `expected_from` — the caller must
    reload rather than trust its in-memory `job` object. On success,
    refreshes `job` in place so the caller can keep using it."""
    values = {"local_state": to, "updated_at": _now(), **updates}
    rowcount = (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.id == job.id, OcrProviderJob.local_state == expected_from)
        .update(values, synchronize_session=False)
    )
    db.flush()
    if rowcount == 0:
        return False
    db.refresh(job)
    return True


def claim_due_submission_work(
    db: Session, *, worker_id: str, lease_seconds: int, limit: int
) -> list[OcrProviderJob]:
    """Claims up to `limit` rows in `pending_submission`, stamping a
    submission lease and advancing to `submitting` in the same
    transaction as the row lock — a concurrently-claiming worker's
    `SKIP LOCKED` query simply never sees these rows."""
    now = _now()
    candidates = (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.local_state == "pending_submission")
        .order_by(OcrProviderJob.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
        .all()
    )
    lease_expiry = now + datetime.timedelta(seconds=lease_seconds)
    for job in candidates:
        job.local_state = "submitting"
        job.submission_lease_owner = worker_id
        job.submission_lease_expires_at = lease_expiry
        job.updated_at = now
    db.flush()
    return candidates


def claim_due_reconciliation_work(
    db: Session, *, worker_id: str, lease_seconds: int, limit: int
) -> list[OcrProviderJob]:
    """Claims up to `limit` in-flight rows (`submitted`/`queued`/`running`)
    whose `next_poll_at` is due and whose reconciliation lease (if any) has
    expired, stamping a fresh lease. Does NOT change `local_state` — the
    worker itself decides the next state once it has actually polled."""
    now = _now()
    candidates = (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.local_state.in_(["submitted", "queued", "running"]))
        .filter(or_(OcrProviderJob.next_poll_at.is_(None), OcrProviderJob.next_poll_at <= now))
        .filter(
            or_(
                OcrProviderJob.reconciliation_lease_expires_at.is_(None),
                OcrProviderJob.reconciliation_lease_expires_at <= now,
            )
        )
        .order_by(OcrProviderJob.next_poll_at.asc().nullsfirst())
        .limit(limit)
        .with_for_update(skip_locked=True)
        .all()
    )
    lease_expiry = now + datetime.timedelta(seconds=lease_seconds)
    for job in candidates:
        job.reconciliation_lease_owner = worker_id
        job.reconciliation_lease_expires_at = lease_expiry
        job.updated_at = now
    db.flush()
    return candidates


def recover_stale_leases(db: Session, *, now: datetime.datetime | None = None) -> int:
    """Spec §8.1's documented recovery transitions: a `submitting` row
    whose submission lease expired goes back to `pending_submission`
    (same idempotency key — the next claim resubmits under the identical
    key, so a provider-side duplicate-admission-if-it-actually-went-
    through is caught by the provider's own idempotency semantics, not
    ours). A row with an expired reconciliation lease just has the lease
    cleared — its `local_state` is untouched, since a stuck poll doesn't
    mean the provider-side job died. Returns the total row count
    recovered, across both kinds, for a caller/test to assert on."""
    now = now or _now()
    submission_recovered = (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.local_state == "submitting")
        .filter(OcrProviderJob.submission_lease_expires_at.isnot(None))
        .filter(OcrProviderJob.submission_lease_expires_at <= now)
        .update(
            {
                "local_state": "pending_submission",
                "submission_lease_owner": None,
                "submission_lease_expires_at": None,
                "updated_at": now,
            },
            synchronize_session=False,
        )
    )
    reconciliation_recovered = (
        db.query(OcrProviderJob)
        .filter(OcrProviderJob.reconciliation_lease_expires_at.isnot(None))
        .filter(OcrProviderJob.reconciliation_lease_expires_at <= now)
        .update(
            {
                "reconciliation_lease_owner": None,
                "reconciliation_lease_expires_at": None,
                "updated_at": now,
            },
            synchronize_session=False,
        )
    )
    db.flush()
    return submission_recovered + reconciliation_recovered
