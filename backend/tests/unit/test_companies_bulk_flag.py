"""
Unit tests for POST /companies/{id}/flag-enforcement — the manufacturer-
scoped bulk version of records.py::flag_for_enforcement. Isolates the
route's own branching (already-flagged / skipped / window-boundary) by
patching apply_officer_scope and flag_record_for_enforcement directly,
rather than mocking the full SQLAlchemy join chain — those are exercised
for real in tests/integration.
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
ENTITY_ID = uuid.uuid4()


def _fake_admin():
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = "Admin"
    p.jurisdiction_level = "National"
    p.region = None
    return p


def _fake_record(verified_days_ago: int, record_id: uuid.UUID | None = None):
    class _Record:
        pass

    r = _Record()
    r.id = record_id or uuid.uuid4()
    r.verified_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=verified_days_ago)
    return r


@pytest.fixture()
def client(request):
    app = create_app()
    mock_db = MagicMock()
    mock_db.get.return_value = object()  # LegalEntity lookup succeeds

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _fake_admin
    with TestClient(app) as c:
        yield c, mock_db
    app.dependency_overrides.clear()


def _post_flag(client: TestClient):
    return client.post(f"/api/v1/companies/{ENTITY_ID}/flag-enforcement")


def test_returns_empty_lists_when_no_candidates_in_window(client) -> None:
    test_client, mock_db = client
    with (
        patch("app.api.v1.companies.get_effective_thresholds", return_value={"repeatViolationDays": 90}),
        patch("app.api.v1.companies.apply_officer_scope") as mock_scope,
    ):
        mock_scope.return_value.all.return_value = []
        response = _post_flag(test_client)
    assert response.status_code == 200
    assert response.json() == {"flagged": [], "skipped": [], "alreadyFlagged": []}


def test_records_outside_the_repeat_violation_window_are_excluded(client) -> None:
    test_client, mock_db = client
    stale_record = _fake_record(verified_days_ago=200)
    with (
        patch("app.api.v1.companies.get_effective_thresholds", return_value={"repeatViolationDays": 90}),
        patch("app.api.v1.companies.apply_officer_scope") as mock_scope,
    ):
        mock_scope.return_value.all.return_value = [stale_record]
        response = _post_flag(test_client)
    assert response.status_code == 200
    assert response.json() == {"flagged": [], "skipped": [], "alreadyFlagged": []}


def test_record_with_an_existing_open_case_is_reported_already_flagged(client) -> None:
    test_client, mock_db = client
    record = _fake_record(verified_days_ago=10)
    mock_db.query.return_value.filter.return_value.filter.return_value.all.return_value = [
        MagicMock(originating_record_id=record.id)
    ]
    with (
        patch("app.api.v1.companies.get_effective_thresholds", return_value={"repeatViolationDays": 90}),
        patch("app.api.v1.companies.apply_officer_scope") as mock_scope,
    ):
        mock_scope.return_value.all.return_value = [record]
        response = _post_flag(test_client)
    assert response.status_code == 200
    body = response.json()
    assert body["flagged"] == []
    assert body["alreadyFlagged"] == [str(record.id)]


def test_record_that_fails_flagging_is_reported_skipped(client) -> None:
    test_client, mock_db = client
    record = _fake_record(verified_days_ago=10)
    mock_db.query.return_value.filter.return_value.filter.return_value.all.return_value = []
    with (
        patch("app.api.v1.companies.get_effective_thresholds", return_value={"repeatViolationDays": 90}),
        patch("app.api.v1.companies.apply_officer_scope") as mock_scope,
        patch(
            "app.api.v1.companies.flag_record_for_enforcement",
            side_effect=HTTPException(status_code=409, detail="Record must be Verified"),
        ),
    ):
        mock_scope.return_value.all.return_value = [record]
        response = _post_flag(test_client)
    assert response.status_code == 200
    body = response.json()
    assert body["flagged"] == []
    assert body["skipped"] == [str(record.id)]


def test_newly_flagged_record_is_serialized_and_returned(client) -> None:
    test_client, mock_db = client
    record = _fake_record(verified_days_ago=10)
    mock_db.query.return_value.filter.return_value.filter.return_value.all.return_value = []
    fake_case = MagicMock()
    with (
        patch("app.api.v1.companies.get_effective_thresholds", return_value={"repeatViolationDays": 90}),
        patch("app.api.v1.companies.apply_officer_scope") as mock_scope,
        patch("app.api.v1.companies.flag_record_for_enforcement", return_value=(fake_case, True)),
        patch("app.api.v1.companies.to_frontend_record", return_value={"id": str(record.id)}),
    ):
        mock_scope.return_value.all.return_value = [record]
        response = _post_flag(test_client)
    assert response.status_code == 200
    body = response.json()
    assert body["flagged"] == [{"id": str(record.id)}]
    assert body["alreadyFlagged"] == []
    assert body["skipped"] == []


def test_entity_not_found_returns_404(client) -> None:
    test_client, mock_db = client
    mock_db.get.return_value = None
    response = _post_flag(test_client)
    assert response.status_code == 404
