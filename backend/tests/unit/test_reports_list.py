"""
Unit tests for GET /reports — Download History's global, scoped,
paginated list. Mocked DB session; apply_officer_scope patched so the
test isolates list_reports's own pagination/serialization logic from the
real jurisdiction-scoping query (covered separately in
tests/integration/test_authz_matrix.py).
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")


def _fake_user():
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = "Enforcement Officer"
    p.jurisdiction_level = "National"
    p.region = None
    return p


def _fake_report(**overrides):
    class _Report:
        pass

    r = _Report()
    r.id = uuid.uuid4()
    r.compliance_record_id = uuid.uuid4()
    r.frozen_snapshot = {"reportMetadata": {"referenceCode": "RC-0001"}}
    r.generated_at = datetime.datetime(2026, 9, 1, tzinfo=datetime.timezone.utc)
    r.generated_by = uuid.uuid4()
    r.status = "COMPLETE"
    r.current_stage = "done"
    r.error_message = None
    r.report_format_version = 1
    r.pdf_storage_key = "some/key.pdf"
    r.docx_storage_key = None
    for key, value in overrides.items():
        setattr(r, key, value)
    return r


@pytest.fixture()
def client(request):
    app = create_app()
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _fake_user
    with TestClient(app) as c:
        yield c, mock_db
    app.dependency_overrides.clear()


def test_list_reports_returns_scoped_reports_with_total_count(client) -> None:
    test_client, mock_db = client
    reports = [_fake_report(), _fake_report()]
    mock_db.query.return_value.filter.return_value.order_by.return_value.count.return_value = 2
    mock_db.query.return_value.filter.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = reports

    with patch("app.api.v1.reports.apply_officer_scope") as mock_scope:
        mock_scope.return_value.subquery.return_value = MagicMock()
        response = test_client.get("/api/v1/reports")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["reports"]) == 2
    assert body["reports"][0]["referenceCode"] == "RC-0001"
    assert body["reports"][0]["formats"] == ["pdf"]
    mock_scope.assert_called_once()


def test_list_reports_applies_pagination_params(client) -> None:
    test_client, mock_db = client
    query_mock = mock_db.query.return_value.filter.return_value.order_by.return_value
    query_mock.count.return_value = 0
    query_mock.offset.return_value.limit.return_value.all.return_value = []

    with patch("app.api.v1.reports.apply_officer_scope") as mock_scope:
        mock_scope.return_value.subquery.return_value = MagicMock()
        response = test_client.get("/api/v1/reports?page=3&pageSize=10")

    assert response.status_code == 200
    query_mock.offset.assert_called_once_with(20)  # (page - 1) * page_size
    query_mock.offset.return_value.limit.assert_called_once_with(10)


def test_list_reports_rejects_page_size_over_100(client) -> None:
    test_client, _mock_db = client
    with patch("app.api.v1.reports.apply_officer_scope"):
        response = test_client.get("/api/v1/reports?pageSize=101")
    assert response.status_code == 422
