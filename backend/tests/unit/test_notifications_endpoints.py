"""
Unit tests for the /notifications routes — mocks the DB session (no real
Postgres), same "unit tests for wiring" split test_activity_endpoint.py
already establishes. Unlike Activity Log, none of these routes are
permission-gated (a notification's recipient_id already is the scope), so
there's no 403 case to cover here.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")


def _fake_profile():
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = "Enforcement Officer"
    p.jurisdiction_level = None
    p.region = "Delhi"
    return p


def _empty_mock_db() -> MagicMock:
    db = MagicMock()
    q = MagicMock()
    for method in ("filter", "order_by", "offset", "limit"):
        getattr(q, method).return_value = q
    q.all.return_value = []
    q.count.return_value = 0
    db.query.return_value = q
    return db


def _client(db: MagicMock | None = None):
    app = create_app()
    mock_db = db if db is not None else _empty_mock_db()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: _fake_profile()
    return TestClient(app), mock_db


def test_list_notifications_empty_shape() -> None:
    client, _mock_db = _client()
    response = client.get("/api/v1/notifications", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert body["totalCount"] == 0
    assert body["unreadCount"] == 0
    assert body["recordLabels"] == {}


def test_unread_count_endpoint() -> None:
    db = _empty_mock_db()
    db.query.return_value.count.return_value = 3
    client, _mock_db = _client(db)
    response = client.get("/api/v1/notifications/unread-count", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    assert response.json() == {"unreadCount": 3}


def test_mark_read_404_when_not_found_or_not_this_users() -> None:
    db = _empty_mock_db()
    db.query.return_value.first.return_value = None
    client, _mock_db = _client(db)
    response = client.post(
        f"/api/v1/notifications/{uuid.uuid4()}/read", headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 404


def test_mark_read_sets_read_at_once_and_commits() -> None:
    db = _empty_mock_db()
    notification = MagicMock()
    notification.id = uuid.uuid4()
    notification.type = "account_created"
    notification.read_at = None
    notification.record_id = None
    notification.entity_type = None
    notification.entity_id = None
    notification.detail = None
    notification.created_at = datetime.now(timezone.utc)
    db.query.return_value.first.return_value = notification

    client, _mock_db = _client(db)
    response = client.post(
        f"/api/v1/notifications/{notification.id}/read", headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    assert notification.read_at is not None
    db.commit.assert_called_once()


def test_mark_all_read_updates_and_commits() -> None:
    db = _empty_mock_db()
    db.query.return_value.update.return_value = 4
    client, _mock_db = _client(db)
    response = client.post("/api/v1/notifications/read-all", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    assert response.json() == {"updated": 4}
    db.commit.assert_called_once()


def test_page_size_capped_at_100() -> None:
    client, _mock_db = _client()
    response = client.get(
        "/api/v1/notifications", params={"pageSize": "500"}, headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    assert response.json()["pageSize"] == 100


def test_invalid_type_filter_silently_ignored() -> None:
    client, _mock_db = _client()
    response = client.get(
        "/api/v1/notifications",
        params={"type": "not_a_real_type"},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 200
