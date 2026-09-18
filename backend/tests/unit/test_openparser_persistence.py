"""OP-Phase 3 — `transition_state`'s compare-and-set contract, verified
against a mocked `Session`. The real row-lock/rowcount semantics need a
real Postgres (see tests/integration/test_openparser_worker.py's
concurrency/crash matrix) — this test only proves `transition_state`
builds the right filter/update and honors `rowcount` correctly, which a
mock can settle without a database."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from app.services.ocr.openparser.persistence import transition_state


def _job(job_id: uuid.UUID) -> MagicMock:
    job = MagicMock()
    job.id = job_id
    return job


def test_successful_transition_returns_true_and_refreshes_the_job() -> None:
    db = MagicMock()
    db.query.return_value.filter.return_value.update.return_value = 1
    job = _job(uuid.uuid4())

    ok = transition_state(db, job, expected_from="submitting", to="submitted", provider_job_id="opj_1")

    assert ok is True
    db.flush.assert_called_once()
    db.refresh.assert_called_once_with(job)


def test_stale_transition_returns_false_and_does_not_refresh() -> None:
    db = MagicMock()
    db.query.return_value.filter.return_value.update.return_value = 0
    job = _job(uuid.uuid4())

    ok = transition_state(db, job, expected_from="submitting", to="submitted")

    assert ok is False
    db.refresh.assert_not_called()


def test_update_values_include_the_target_state_and_extra_fields() -> None:
    db = MagicMock()
    query_mock = db.query.return_value.filter.return_value
    query_mock.update.return_value = 1
    job = _job(uuid.uuid4())

    transition_state(
        db, job, expected_from="submitting", to="failed", last_error_message="boom"
    )

    values = query_mock.update.call_args.args[0]
    assert values["local_state"] == "failed"
    assert values["last_error_message"] == "boom"
    assert "updated_at" in values


def test_filter_is_scoped_to_the_job_id_and_expected_state() -> None:
    from app.db.models.ocr_provider_job import OcrProviderJob

    db = MagicMock()
    db.query.return_value.filter.return_value.update.return_value = 1
    job_id = uuid.uuid4()
    job = _job(job_id)

    transition_state(db, job, expected_from="pending_submission", to="submitting")

    filter_args = db.query.return_value.filter.call_args.args
    # Two positional comparison expressions: id == job.id, local_state == expected_from.
    assert len(filter_args) == 2
    rendered = [str(arg) for arg in filter_args]
    assert any("id" in r for r in rendered)
    assert any("local_state" in r for r in rendered)
