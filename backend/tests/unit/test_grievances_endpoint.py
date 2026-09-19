"""
Unit tests for POST /grievances and GET /grievances/{reference} — the one
public, unauthenticated surface in this product. Mocks the DB session and
the rate limiter (app.services.auth.rate_limit.check_and_increment); no
real Postgres or B2.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.v1.grievances import _SHORT_CODE_ALPHABET, _generate_reference
from app.db.session import get_db
from app.main import create_app


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), color=(10, 10, 10)).save(buf, format="PNG")
    return buf.getvalue()


def test_generate_reference_matches_lm_dash_six_char_format() -> None:
    reference = _generate_reference()
    assert reference.startswith("LM-")
    body = reference[3:]
    assert len(body) == 6
    assert all(ch in _SHORT_CODE_ALPHABET for ch in body)
    # No ambiguous characters — matches src/lib/utils/shortCode.ts exactly.
    assert not set(body) & set("01OIL")


@pytest.fixture()
def client(request) -> TestClient:
    app = create_app()
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _submit(client: TestClient, **form_overrides):
    data = {"concerns": '["Wrong Price", "No MRP Displayed"]', **form_overrides}
    return client.post(
        "/api/v1/grievances",
        data=data,
        files={"photo": ("evidence.png", _png_bytes(), "image/png")},
    )


def test_honeypot_field_short_circuits_with_a_fake_success_and_no_rate_limit_check(client) -> None:
    with patch("app.api.v1.grievances.check_and_increment") as mock_check:
        response = _submit(client, website="http://spam.example")
    assert response.status_code == 201
    assert response.json()["reference"].startswith("LM-")
    mock_check.assert_not_called()


def test_rate_limited_submission_returns_429_with_retry_after(client) -> None:
    with patch("app.api.v1.grievances.check_and_increment", return_value=False):
        response = _submit(client)
    assert response.status_code == 429
    assert response.headers["retry-after"] == "3600"


def test_unsupported_content_type_is_rejected(client) -> None:
    with patch("app.api.v1.grievances.check_and_increment", return_value=True):
        response = client.post(
            "/api/v1/grievances",
            data={"concerns": '["Wrong Price"]'},
            files={"photo": ("evidence.gif", _png_bytes(), "image/gif")},
        )
    assert response.status_code == 422


def test_malformed_concerns_json_is_rejected(client) -> None:
    with patch("app.api.v1.grievances.check_and_increment", return_value=True):
        response = _submit(client, concerns="not json")
    assert response.status_code == 422


def test_concerns_must_be_a_list_of_strings(client) -> None:
    with patch("app.api.v1.grievances.check_and_increment", return_value=True):
        response = _submit(client, concerns='{"not": "a list"}')
    assert response.status_code == 422


def test_lookup_of_unknown_reference_returns_404(client) -> None:
    client.app.dependency_overrides.setdefault(get_db, lambda: iter([MagicMock()]))
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    def _override():
        yield mock_db

    client.app.dependency_overrides[get_db] = _override
    with patch("app.api.v1.grievances.check_and_increment", return_value=True):
        response = client.get("/api/v1/grievances/LM-XXXXXX")
    assert response.status_code == 404


def test_lookup_before_pipeline_produces_a_record_reports_received(client) -> None:
    grievance = MagicMock()
    grievance.reference = "LM-234567"
    from datetime import datetime, timezone

    grievance.submitted_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
    grievance.scan_session_id = uuid.uuid4()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = grievance
    mock_db.get.return_value = None  # scan session not found yet -> pipeline hasn't produced a record

    def _override():
        yield mock_db

    client.app.dependency_overrides[get_db] = _override
    with patch("app.api.v1.grievances.check_and_increment", return_value=True):
        response = client.get("/api/v1/grievances/LM-234567")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Received"
    assert body["reference"] == "LM-234567"
