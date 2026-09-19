"""
Unit tests for app/api/deps/body_size.py (P2 hardening, F-006/N-16) — the
Content-Length pre-check dependency and the two streaming-read-with-cap
helpers, plus a live-route proof that POST /scans/quality-check now
rejects a declared-oversized body before any read.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import UploadFile

from app.api.deps.auth import get_current_user
from app.api.deps.body_size import max_body_size, read_capped, read_capped_sync
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("66666666-6666-6666-6666-666666666666")


def _fake_profile(role: str = "Enforcement Officer"):
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
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


class _FakeSettings:
    def __init__(self, **overrides):
        self.scan_image_max_bytes = overrides.get("scan_image_max_bytes", 1000)


def _request(headers: dict) -> MagicMock:
    req = MagicMock()
    req.headers = headers
    return req


def test_max_body_size_passes_when_content_length_within_cap() -> None:
    check = max_body_size("scan_image_max_bytes")
    check(_request({"content-length": "500"}), _FakeSettings(scan_image_max_bytes=1000))


def test_max_body_size_rejects_declared_oversized_content_length() -> None:
    check = max_body_size("scan_image_max_bytes")
    with pytest.raises(HTTPException) as exc_info:
        check(_request({"content-length": "1500"}), _FakeSettings(scan_image_max_bytes=1000))
    assert exc_info.value.status_code == 413


def test_max_body_size_ignores_missing_or_malformed_content_length() -> None:
    check = max_body_size("scan_image_max_bytes")
    check(_request({}), _FakeSettings(scan_image_max_bytes=1000))
    check(_request({"content-length": "not-a-number"}), _FakeSettings(scan_image_max_bytes=1000))


@pytest.mark.asyncio
async def test_read_capped_returns_bytes_within_cap() -> None:
    upload = UploadFile(io.BytesIO(b"x" * 100), filename="a.png")
    result = await read_capped(upload, 1000)
    assert result == b"x" * 100


@pytest.mark.asyncio
async def test_read_capped_rejects_once_running_total_exceeds_cap() -> None:
    upload = UploadFile(io.BytesIO(b"x" * 5_000_000), filename="a.png")
    with pytest.raises(HTTPException) as exc_info:
        await read_capped(upload, 1000)
    assert exc_info.value.status_code == 413


def test_read_capped_sync_returns_bytes_within_cap() -> None:
    upload = UploadFile(io.BytesIO(b"y" * 100), filename="a.png")
    result = read_capped_sync(upload, 1000)
    assert result == b"y" * 100


def test_read_capped_sync_rejects_once_running_total_exceeds_cap() -> None:
    upload = UploadFile(io.BytesIO(b"y" * 5_000_000), filename="a.png")
    with pytest.raises(HTTPException) as exc_info:
        read_capped_sync(upload, 1000)
    assert exc_info.value.status_code == 413


def test_read_capped_sync_never_buffers_past_the_cap() -> None:
    """The streaming-cap defense's whole point: a client that lies about
    Content-Length (or sends none) must never have its full oversized body
    read into memory before rejection."""
    fake_file = MagicMock()
    # Each chunk is comfortably under the cap alone, but the running total
    # crosses it on the 3rd chunk — the 4th chunk must never be read.
    fake_file.read.side_effect = [b"a" * 400, b"b" * 400, b"c" * 400, b"d" * 400, b""]
    upload = MagicMock()
    upload.file = fake_file

    with pytest.raises(HTTPException):
        read_capped_sync(upload, 1000)

    assert fake_file.read.call_count == 3


@pytest.fixture()
def client_as():
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


def test_quality_check_route_rejects_declared_oversized_body(client_as) -> None:
    client = client_as("Enforcement Officer")
    response = client.post(
        "/api/v1/scans/quality-check",
        data={"angle": "front"},
        files={"file": ("photo.png", _sharp_label_bytes(), "image/png")},
        headers={
            "Authorization": "Bearer fake",
            # Lie about Content-Length being far larger than the real body
            # and larger than the configured cap — the pre-check dependency
            # must reject before the route body even runs.
            "content-length": str(50_000_000),
        },
    )
    assert response.status_code == 413


def test_quality_check_route_accepts_body_within_cap(client_as) -> None:
    client = client_as("Enforcement Officer")
    response = client.post(
        "/api/v1/scans/quality-check",
        data={"angle": "front"},
        files={"file": ("photo.png", _sharp_label_bytes(), "image/png")},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 200
