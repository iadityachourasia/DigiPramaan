"""
OP-Phase 3 — integration tests against a real, disposable Postgres.
Fundamentally needs real `FOR UPDATE SKIP LOCKED` and row-lock semantics
no mock can substitute for: the concurrency matrix (two real sessions
claiming due work must never double-claim a row) and the crash matrix
(a stale lease must be reclaimable, and a replayed submission must never
mint a second idempotency key for the same attempt).

Same "runs ONLY against a dedicated, disposable TEST_DATABASE_URL"
discipline as test_authz_matrix.py — this test inserts and deletes real
scan_sessions/evidence_images/ocr_provider_jobs rows.
"""

from __future__ import annotations

import datetime
import uuid

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.db.models import EvidenceImage, OcrProviderJob, Profile, ScanSession
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.jobs.pipeline import initial_stages_pending_capture
from app.services.ocr.openparser.persistence import (
    claim_due_submission_work,
    create_job_intent,
    recover_stale_leases,
    transition_state,
)

pytestmark = pytest.mark.integration

RUN_ID = uuid.uuid4().hex[:8]


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "scan_sessions/evidence_images/ocr_provider_jobs rows."
        )
    if settings.test_database_url != settings.database_url:
        pytest.skip(
            "TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else — "
            "SessionLocal (app.db.session) always connects via DATABASE_URL, so this test "
            "only runs meaningfully when both env vars point at the same disposable database."
        )


class _Fixture:
    def __init__(self) -> None:
        self.db = SessionLocal()
        self.profile_ids: list[uuid.UUID] = []
        self.scan_session_ids: list[uuid.UUID] = []
        self.evidence_image_ids: list[uuid.UUID] = []
        self.job_ids: list[uuid.UUID] = []

    def build(self) -> None:
        user_id = uuid.uuid4()
        self.db.execute(auth_users.insert().values(id=user_id))
        profile = Profile(
            id=user_id,
            username=f"opworker-{RUN_ID}",
            email=f"opworker-{RUN_ID}@example.invalid",
            full_name="OP Worker Test",
            role="Enforcement Officer",
            region="Maharashtra",
            jurisdiction_level="State",
            jurisdiction_name="Maharashtra",
        )
        self.db.add(profile)
        self.db.flush()
        self.profile_ids.append(user_id)

        self.scan_session = ScanSession(
            created_by=user_id,
            region="Maharashtra",
            stages=initial_stages_pending_capture(),
            status="pending",
        )
        self.db.add(self.scan_session)
        self.db.flush()
        self.scan_session_ids.append(self.scan_session.id)

        self.evidence_image = EvidenceImage(
            scan_session_id=self.scan_session.id,
            angle="front",
            storage_key=f"evidence/opworker-{RUN_ID}/front.jpg",
        )
        self.db.add(self.evidence_image)
        self.db.flush()
        self.evidence_image_ids.append(self.evidence_image.id)

        self.db.commit()

    def make_job(self, *, attempt_number: int = 1, idempotency_key: str | None = None) -> OcrProviderJob:
        job = create_job_intent(
            self.db,
            scan_session_id=self.scan_session.id,
            evidence_image_id=self.evidence_image.id,
            angle="front",
            provider="openparser",
            provider_tenant_alias="test-tenant",
            provider_key_alias="key-1",
            operation="parse_single",
            idempotency_key=idempotency_key or f"dp1-{uuid.uuid4().hex}-{attempt_number}",
            canonical_request_sha256="c" * 64,
            model_id="paddleocr-vl-1.6",
            output_format="openparser@1",
            profile_version="openparser-quality-max-v1",
            input_storage_key=self.evidence_image.storage_key,
            input_sha256="a" * 64,
            input_byte_count=1024,
            input_media_type="image/jpeg",
            attempt_number=attempt_number,
        )
        self.db.commit()
        self.job_ids.append(job.id)
        return job

    def teardown(self) -> None:
        self.db.rollback()
        for model, ids in (
            (OcrProviderJob, self.job_ids),
            (EvidenceImage, self.evidence_image_ids),
            (ScanSession, self.scan_session_ids),
            (Profile, self.profile_ids),
        ):
            for row_id in ids:
                obj = self.db.get(model, row_id)
                if obj is not None:
                    self.db.delete(obj)
            self.db.flush()
        for user_id in self.profile_ids:
            self.db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        self.db.commit()
        self.db.close()


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    f = _Fixture()
    f.build()
    try:
        yield f
    finally:
        f.teardown()


def test_create_job_intent_starts_in_pending_submission(fixture: _Fixture) -> None:
    job = fixture.make_job()
    assert job.local_state == "pending_submission"
    assert job.attempt_number == 1


def test_concurrent_claims_never_double_claim_the_same_row(fixture: _Fixture) -> None:
    """Two real sessions calling claim_due_submission_work concurrently
    against the same due rows must partition them — the whole point of
    `SKIP LOCKED` over a plain `FOR UPDATE`, which would instead make the
    second session block and then see the row already moved to
    'submitting' by the first (still safe, but not what SKIP LOCKED is
    for). Ten jobs, two claimers, five each, zero overlap."""
    for attempt in range(1, 11):
        fixture.make_job(attempt_number=attempt)

    db_a = SessionLocal()
    db_b = SessionLocal()
    try:
        claimed_a = claim_due_submission_work(db_a, worker_id="worker-a", lease_seconds=60, limit=5)
        # db_a's transaction still holds its row locks (not yet committed) —
        # db_b's SKIP LOCKED claim must skip every row db_a took.
        claimed_b = claim_due_submission_work(db_b, worker_id="worker-b", lease_seconds=60, limit=5)
        db_a.commit()
        db_b.commit()

        ids_a = {job.id for job in claimed_a}
        ids_b = {job.id for job in claimed_b}
        assert len(ids_a) == 5
        assert len(ids_b) == 5
        assert ids_a.isdisjoint(ids_b), "the same row was claimed by both workers"
    finally:
        db_a.close()
        db_b.close()


def test_expired_submission_lease_is_recovered_and_reclaimable(fixture: _Fixture) -> None:
    """Simulates a crashed worker: a job stuck in 'submitting' with an
    expired lease. recover_stale_leases must put it back to
    pending_submission with the SAME idempotency key (a replay uses the
    same attempt/key, per spec §9 — never mints a new one), and a second
    worker must then be able to claim it."""
    job = fixture.make_job()
    original_key = job.idempotency_key

    ok = transition_state(
        fixture.db,
        job,
        expected_from="pending_submission",
        to="submitting",
        submission_lease_owner="crashed-worker",
        submission_lease_expires_at=datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(seconds=10),
    )
    fixture.db.commit()
    assert ok is True

    recovered = recover_stale_leases(fixture.db)
    fixture.db.commit()
    assert recovered >= 1

    fixture.db.refresh(job)
    assert job.local_state == "pending_submission"
    assert job.idempotency_key == original_key, "a stale-lease recovery must never mint a new key"
    assert job.submission_lease_owner is None

    claimed = claim_due_submission_work(fixture.db, worker_id="worker-b", lease_seconds=60, limit=10)
    fixture.db.commit()
    assert job.id in {claimed_job.id for claimed_job in claimed}


def test_a_stale_transition_is_rejected_and_changes_nothing(fixture: _Fixture) -> None:
    job = fixture.make_job()
    transition_state(fixture.db, job, expected_from="pending_submission", to="submitting")
    fixture.db.commit()
    assert job.local_state == "submitting"

    # Wrong expected_from — the row already moved on.
    ok = transition_state(
        fixture.db, job, expected_from="pending_submission", to="submitted", provider_job_id="opj_x"
    )
    fixture.db.commit()

    assert ok is False
    fixture.db.refresh(job)
    assert job.local_state == "submitting"
    assert job.provider_job_id is None
