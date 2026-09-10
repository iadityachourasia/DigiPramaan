"""
Unit tests for POST /scans and its auth/quality gating — mocks the DB
session, B2 client, and the background pipeline runner (no real Postgres,
B2, PaddleOCR, or Gemini call). The live version of the full happy path
(real 3-image scan -> B2 -> OCR -> Gemini -> provisional record) was
validated separately over real HTTP against a real running server; these
tests cover the specific failure-mode contract the Phase 2 spec calls out:
unauthorized access and a rejected bad-quality image.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps.auth import get_current_user
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


def _fake_profile(role: str = "Enforcement Officer"):
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = role
    return p


def _png_bytes(size: tuple[int, int], color: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format="PNG")
    return buf.getvalue()


def _sharp_label_bytes() -> bytes:
    img = Image.new("RGB", (800, 800), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (0, 0, 0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def client_as(request):
    """Parametrized-by-call fixture: client_as(role_or_None) gives a
    TestClient with get_current_user overridden to that role, or left
    un-overridden (real 401-producing path) when role is None."""
    app = create_app()
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db

    def _make(role: str | None):
        if role is not None:
            app.dependency_overrides[get_current_user] = lambda: _fake_profile(role)
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def _post_scan(client: TestClient, headers: dict | None = None, images: dict | None = None):
    files = images or {
        "front": ("front.png", _sharp_label_bytes(), "image/png"),
        "back": ("back.png", _sharp_label_bytes(), "image/png"),
        "side_pdp": ("side_pdp.png", _sharp_label_bytes(), "image/png"),
    }
    return client.post(
        "/api/v1/scans",
        data={"metadata": '{"category": "Packaged Food", "region": "Maharashtra"}'},
        files={k: (name, content, ctype) for k, (name, content, ctype) in files.items()},
        headers=headers or {},
    )


def test_scan_without_auth_header_returns_401(client_as) -> None:
    client = client_as(None)
    response = _post_scan(client)
    assert response.status_code == 401


def test_scan_with_role_lacking_permission_returns_403(client_as) -> None:
    # "Reviewer" exists in ROLE_PERMISSIONS but does not carry scan.create.
    client = client_as("Reviewer")
    response = _post_scan(client, headers={"Authorization": "Bearer fake"})
    assert response.status_code == 403


def test_scan_with_one_bad_quality_image_is_rejected_with_no_db_write(client_as) -> None:
    client = client_as("Enforcement Officer")
    with patch("app.api.v1.scans.run_pipeline") as mock_run_pipeline:
        response = _post_scan(
            client,
            headers={"Authorization": "Bearer fake"},
            images={
                # Tiny + dark + flat -> fails minimum_resolution, blur, darkness.
                "front": ("front.png", _png_bytes((50, 50), (5, 5, 5)), "image/png"),
                "back": ("back.png", _sharp_label_bytes(), "image/png"),
                "side_pdp": ("side_pdp.png", _sharp_label_bytes(), "image/png"),
            },
        )

    assert response.status_code == 400
    body = response.json()
    assert "front" in body["error"]["message"]
    mock_run_pipeline.assert_not_called()


def test_scan_with_duplicate_images_is_rejected(client_as) -> None:
    client = client_as("Enforcement Officer")
    identical = _sharp_label_bytes()
    with patch("app.api.v1.scans.run_pipeline") as mock_run_pipeline:
        response = _post_scan(
            client,
            headers={"Authorization": "Bearer fake"},
            images={
                "front": ("front.png", identical, "image/png"),
                "back": ("back.png", identical, "image/png"),
                "side_pdp": ("side_pdp.png", _sharp_label_bytes(), "image/png"),
            },
        )

    assert response.status_code == 400
    message = response.json()["error"]["message"]
    assert "front" in message and "back" in message
    mock_run_pipeline.assert_not_called()
