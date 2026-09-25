"""
Unit tests for app/jobs/reports.py::render_via_http (F-003 fix,
2026-09-19) — mocks httpx.post, no real network, no real Next.js server.
Confirms the subprocess->HTTP swap carries the same contract (base64
images/snapshot in, {pdfBase64, docxBase64} out) and fails loudly rather
than silently when misconfigured or the remote side errors.
"""

from __future__ import annotations

import base64
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.jobs.reports import render_via_http


class _FakeImagePaths:
    def __init__(self, tmp_path):
        front = tmp_path / "front.jpg"
        front.write_bytes(b"front-bytes")
        self.by_image_id = {"img-1": front}
        self.violation_crops = {}
        self.embedded_dimensions = {"img-1": (100, 200)}


class _FakeSnapshot:
    def model_dump(self, by_alias=True):
        return {"reportMetadata": {"reportId": "abc"}}


def _settings(secret: str | None = "shared-secret") -> MagicMock:
    settings = MagicMock()
    settings.frontend_base_url = "http://localhost:3000"
    if secret is None:
        settings.internal_render_secret = None
    else:
        settings.internal_render_secret = MagicMock(get_secret_value=MagicMock(return_value=secret))
    return settings


def test_raises_clearly_when_secret_is_not_configured(tmp_path) -> None:
    with pytest.raises(RuntimeError, match="INTERNAL_RENDER_SECRET"):
        render_via_http(_FakeSnapshot(), _FakeImagePaths(tmp_path), _settings(secret=None))


def test_sends_base64_images_and_bearer_auth_and_parses_response(tmp_path) -> None:
    pdf_b64 = base64.b64encode(b"pdf-bytes").decode()
    docx_b64 = base64.b64encode(b"docx-bytes").decode()
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = {"pdfBase64": pdf_b64, "docxBase64": docx_b64}

    with patch("app.jobs.reports.httpx.post", return_value=mock_response) as mock_post:
        pdf_bytes, docx_bytes = render_via_http(_FakeSnapshot(), _FakeImagePaths(tmp_path), _settings())

    assert pdf_bytes == b"pdf-bytes"
    assert docx_bytes == b"docx-bytes"

    call = mock_post.call_args
    assert call.args[0] == "http://localhost:3000/api/internal/render-report"
    assert call.kwargs["headers"]["Authorization"] == "Bearer shared-secret"
    sent_images = call.kwargs["json"]["images"]
    assert sent_images["byImageId"] == {"img-1": base64.b64encode(b"front-bytes").decode("ascii")}
    assert sent_images["dimensions"] == {"img-1": [100, 200]}
    # logoPath is no longer sent -- the route resolves it locally now.
    assert "logoPath" not in call.kwargs["json"]


def test_non_200_response_raises_without_leaking_body(tmp_path) -> None:
    mock_response = MagicMock(status_code=500, text="<secret leaked here>")
    with patch("app.jobs.reports.httpx.post", return_value=mock_response):
        with pytest.raises(RuntimeError) as exc_info:
            render_via_http(_FakeSnapshot(), _FakeImagePaths(tmp_path), _settings())
    assert "<secret leaked here>" not in str(exc_info.value)


def test_network_error_raises_clearly(tmp_path) -> None:
    with patch("app.jobs.reports.httpx.post", side_effect=httpx.ConnectError("refused")):
        with pytest.raises(RuntimeError, match="Report renderer request failed"):
            render_via_http(_FakeSnapshot(), _FakeImagePaths(tmp_path), _settings())
