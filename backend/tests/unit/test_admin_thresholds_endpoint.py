"""
TestClient-based validation-bounds tests for PUT /admin/thresholds —
each of the four rejection branches in api/v1/admin.py::put_thresholds.
Mocked DB session, no real Postgres (see test_admin_thresholds.py for the
pure get_effective_thresholds/set_thresholds unit tests).
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")

_VALID_PAYLOAD = {
    "repeatViolationCount": 3,
    "repeatViolationDays": 90,
    "ocrConfidenceThreshold": 70,
    "excellentMinimum": 90,
    "goodMinimum": 70,
    "poorMinimum": 40,
}


def _fake_admin():
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = "Admin"
    p.jurisdiction_level = "National"
    p.region = None
    return p


@pytest.fixture()
def client(request):
    app = create_app()
    mock_db = MagicMock()
    mock_db.query.return_value.order_by.return_value.first.return_value = None

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _fake_admin
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _put(client: TestClient, **overrides) -> object:
    payload = {**_VALID_PAYLOAD, **overrides}
    return client.put("/api/v1/admin/thresholds", json=payload)


def test_put_thresholds_accepts_a_valid_payload(client) -> None:
    response = _put(client)
    assert response.status_code == 200


def test_put_thresholds_rejects_repeat_violation_count_below_one(client) -> None:
    response = _put(client, repeatViolationCount=0)
    assert response.status_code == 422
    assert "repeatViolationCount" in response.json()["error"]["message"]


@pytest.mark.parametrize("days", [0, 366])
def test_put_thresholds_rejects_repeat_violation_days_outside_bounds(client, days) -> None:
    response = _put(client, repeatViolationDays=days)
    assert response.status_code == 422
    assert "repeatViolationDays" in response.json()["error"]["message"]


@pytest.mark.parametrize("value", [0, 101])
def test_put_thresholds_rejects_ocr_confidence_outside_bounds(client, value) -> None:
    response = _put(client, ocrConfidenceThreshold=value)
    assert response.status_code == 422
    assert "ocrConfidenceThreshold" in response.json()["error"]["message"]


def test_put_thresholds_rejects_quality_bands_out_of_order(client) -> None:
    response = _put(client, excellentMinimum=50, goodMinimum=70, poorMinimum=40)
    assert response.status_code == 422
    assert "excellentMinimum" in response.json()["error"]["message"]


def test_put_thresholds_rejects_equal_quality_band_boundaries(client) -> None:
    response = _put(client, excellentMinimum=70, goodMinimum=70, poorMinimum=40)
    assert response.status_code == 422
