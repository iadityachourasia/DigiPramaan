"""
Unit tests for OP-Phase 1's desktop upload-once intake endpoints:
POST /scans/draft, POST /scans/{id}/images/{angle}, POST /scans/{id}/finalize.
Mocked DB session, B2 client, and background pipeline runner — same
convention as test_scans_endpoint.py.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps.auth import get_current_user
from app.db.models import ComplianceRecord, EvidenceImage
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")
OTHER_USER_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")


def _fake_profile(role: str = "Enforcement Officer", user_id: uuid.UUID = TEST_USER_ID):
    class _Profile:
        pass

    p = _Profile()
    p.id = user_id
    p.role = role
    p.jurisdiction_level = "National"
    p.region = None
    return p


def _sharp_label_bytes() -> bytes:
    img = Image.new("RGB", (800, 800), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (0, 0, 0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class _FakeScanSession:
    def __init__(self, created_by: uuid.UUID, stages=None):
        self.id = uuid.uuid4()
        self.created_by = created_by
        self.category = None
        self.region = None
        self.record_id = None
        self.stages = stages if stages is not None else [
            {"id": "uploading", "state": "pending"},
            {"id": "qualityCheck", "state": "pending"},
        ]
        self.created_at = None


def _client(session, role: str = "Enforcement Officer", user_id: uuid.UUID = TEST_USER_ID):
    app = create_app()
    mock_db = MagicMock()
    mock_db.get.return_value = session

    def _query_side_effect(*entities):
        q = MagicMock()
        q.filter.return_value = q
        # is_scan_session_record_verified: single .filter().first() -> None (not verified)
        # accept_evidence_image's supersede check: .filter().filter().first() -> None (no prior image)
        q.first.return_value = None
        q.all.return_value = []
        return q

    mock_db.query.side_effect = _query_side_effect

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: _fake_profile(role, user_id)
    return TestClient(app), mock_db


def test_create_draft_returns_scan_id():
    app = create_app()
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: _fake_profile()
    client = TestClient(app)

    response = client.post("/api/v1/scans/draft", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 201
    assert "scanId" in response.json()
    mock_db.commit.assert_called_once()


def test_upload_image_accepts_a_good_photo():
    session = _FakeScanSession(created_by=TEST_USER_ID)
    client, mock_db = _client(session)

    with patch("app.services.scans.intake.get_s3_client", return_value=MagicMock()):
        response = client.post(
            f"/api/v1/scans/{session.id}/images/front",
            files={"file": ("front.png", _sharp_label_bytes(), "image/png")},
            headers={"Authorization": "Bearer fake"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["acceptanceState"] in ("PASS", "PASS_WITH_WARNINGS")


def test_upload_image_on_unowned_scan_is_404():
    session = _FakeScanSession(created_by=OTHER_USER_ID)
    client, _mock_db = _client(session)

    response = client.post(
        f"/api/v1/scans/{session.id}/images/front",
        files={"file": ("front.png", _sharp_label_bytes(), "image/png")},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 404


def test_upload_image_rejects_unknown_angle():
    session = _FakeScanSession(created_by=TEST_USER_ID)
    client, _mock_db = _client(session)

    response = client.post(
        f"/api/v1/scans/{session.id}/images/top",
        files={"file": ("front.png", _sharp_label_bytes(), "image/png")},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 422


def test_finalize_rejects_missing_mandatory_angles():
    session = _FakeScanSession(created_by=TEST_USER_ID)
    client, mock_db = _client(session)
    # No EvidenceImage rows present -> .all() (configured to []) means
    # both front and back are missing.

    response = client.post(
        f"/api/v1/scans/{session.id}/finalize",
        json={"category": "Packaged Food", "region": "Maharashtra"},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 422
    assert "missingAngles" in response.json()["error"]["details"] or "missingAngles" in str(response.json())


def test_finalize_second_call_is_idempotent_and_does_not_reschedule():
    """The already-finalized branch (stages show uploading/completed) must
    short-circuit before scheduling run_pipeline a second time."""
    already_finalized_stages = [
        {"id": "uploading", "state": "completed", "summary": "x"},
        {"id": "qualityCheck", "state": "completed", "summary": "x"},
    ]
    session = _FakeScanSession(created_by=TEST_USER_ID, stages=already_finalized_stages)
    client, mock_db = _client(session)

    with patch("app.api.v1.scans.run_pipeline") as mock_run_pipeline:
        response = client.post(
            f"/api/v1/scans/{session.id}/finalize",
            json={"category": "Packaged Food", "region": "Maharashtra"},
            headers={"Authorization": "Bearer fake"},
        )
    assert response.status_code == 201
    assert response.json()["id"] == str(session.id)
    mock_run_pipeline.assert_not_called()
    mock_db.commit.assert_not_called()
