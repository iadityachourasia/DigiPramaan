"""
Unit tests for GET /activity — mocks the DB session (no real Postgres).
Real query-shape/region-scoping/filter correctness is covered by
tests/integration/test_activity_log.py against the disposable Postgres;
these tests cover permission gating and the empty-result shape, matching
the "unit tests for wiring, integration tests for query correctness"
split already established for records.py/records_workflow.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")


def _fake_profile(role: str):
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = role
    p.jurisdiction_level = "National"
    p.region = None
    return p


def _empty_mock_db() -> MagicMock:
    """A single self-looping query mock: every chainable method returns
    itself, and every terminal method (`all`/`count`) returns an empty
    result — handles all three distinct query shapes list_activity() uses
    (event+profile join, record-label lookup, distinct-region lookup)
    uniformly, since none of these tests need real data back."""
    db = MagicMock()
    q = MagicMock()
    for method in ("filter", "outerjoin", "order_by", "offset", "limit", "distinct"):
        getattr(q, method).return_value = q
    q.all.return_value = []
    q.count.return_value = 0
    db.query.return_value = q
    return db


def _client(role: str):
    app = create_app()
    mock_db = _empty_mock_db()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: _fake_profile(role)
    return TestClient(app), mock_db


def test_activity_forbidden_for_enforcement_officer() -> None:
    client, _mock_db = _client("Enforcement Officer")
    response = client.get("/api/v1/activity", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 403


def test_activity_permitted_for_admin_empty_result() -> None:
    client, _mock_db = _client("Admin")
    response = client.get("/api/v1/activity", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert body["totalCount"] == 0
    assert body["availableRegions"] == []
    assert body["recordLabels"] == {}


def test_activity_permitted_for_reviewer() -> None:
    client, _mock_db = _client("Reviewer")
    response = client.get("/api/v1/activity", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200


def test_activity_page_size_capped_at_100() -> None:
    client, _mock_db = _client("Admin")
    response = client.get(
        "/api/v1/activity", params={"pageSize": "500"}, headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    assert response.json()["pageSize"] == 100


def test_activity_unknown_type_filtered_out_silently() -> None:
    client, _mock_db = _client("Admin")
    response = client.get(
        "/api/v1/activity",
        params={"types": ["not_a_real_type"]},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 200
