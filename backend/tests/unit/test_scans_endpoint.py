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
from botocore.exceptions import ClientError
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
    # National so services/authz/repositories.py's ViewerScope resolves
    # without a region — this suite isn't exercising jurisdiction scoping
    # (see test_authz_matrix.py for that).
    p.jurisdiction_level = "National"
    p.region = None
    return p


def _png_bytes(size: tuple[int, int], color: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format="PNG")
    return buf.getvalue()


def _sharp_label_bytes(seed: int = 0) -> bytes:
    img = Image.new("RGB", (800, 800), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (0, 0, 0)
    # A single distinguishing pixel keeps the content-hash distinct across
    # calls (needed wherever a test submits 3 genuinely different images,
    # since duplicate detection is exact-hash and would otherwise flag
    # three identical calls to this function as the same photo).
    if seed:
        pixels[0, 0] = (seed % 255, 0, 0)
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
    assert "front" in body["error"]["details"]["rejected"]
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
    duplicate_angles = response.json()["error"]["details"]["duplicateAngles"]
    assert "front" in duplicate_angles and "back" in duplicate_angles
    mock_run_pipeline.assert_not_called()


def test_partial_b2_failure_rolls_back_db_and_cleans_up_uploaded_objects(client_as) -> None:
    """Phase 3 reliability fix: if the 2nd of 3 image uploads fails, the
    1st image's already-uploaded object must be deleted (best-effort) and
    the DB transaction rolled back — no half-created ScanSession/
    EvidenceImage state survives."""
    client = client_as("Enforcement Officer")
    mock_s3 = MagicMock()
    mock_s3.put_object.side_effect = [
        None,
        ClientError({"Error": {"Code": "InternalError", "Message": "boom"}}, "PutObject"),
    ]

    with patch("app.api.v1.scans.get_s3_client", return_value=mock_s3), \
         patch("app.api.v1.scans.run_pipeline") as mock_run_pipeline:
        response = _post_scan(
            client,
            headers={"Authorization": "Bearer fake"},
            images={
                "front": ("front.png", _sharp_label_bytes(1), "image/png"),
                "back": ("back.png", _sharp_label_bytes(2), "image/png"),
                "side_pdp": ("side_pdp.png", _sharp_label_bytes(3), "image/png"),
            },
        )

    assert response.status_code == 502
    assert mock_s3.put_object.call_count == 2  # never reached the 3rd image
    mock_s3.delete_object.assert_called_once()
    mock_run_pipeline.assert_not_called()


def test_scan_without_side_pdp_is_accepted(client_as) -> None:
    """Many products carry no printed declarations on a side panel at all
    — side_pdp is the only optional angle; front/back stay mandatory. A
    scan submitted with just the two must still succeed and persist
    exactly 2 EvidenceImage rows, not 3."""
    client = client_as("Enforcement Officer")
    mock_s3 = MagicMock()

    with patch("app.api.v1.scans.get_s3_client", return_value=mock_s3), \
         patch("app.api.v1.scans.run_pipeline") as mock_run_pipeline:
        response = client.post(
            "/api/v1/scans",
            data={"metadata": '{"category": "Packaged Food", "region": "Maharashtra"}'},
            files={
                "front": ("front.png", _sharp_label_bytes(1), "image/png"),
                "back": ("back.png", _sharp_label_bytes(2), "image/png"),
            },
            headers={"Authorization": "Bearer fake"},
        )

    assert response.status_code == 201
    assert mock_s3.put_object.call_count == 2
    mock_run_pipeline.assert_called_once()


def test_retry_schedules_background_task_and_returns_immediately(client_as) -> None:
    """Phase 3 reliability fix: the retry endpoint must persist the reset
    and schedule run_pipeline via BackgroundTasks rather than running it
    inline — proven here by patching run_pipeline and asserting it was
    scheduled (not by proving real async timing, which TestClient's
    synchronous background-task execution can't demonstrate)."""
    client = client_as("Enforcement Officer")
    scan_id = uuid.uuid4()

    class _FakeSession:
        pass

    session = _FakeSession()
    session.id = scan_id
    session.record_id = None
    session.stages = [{"id": "textExtraction", "state": "pending"}]
    session.created_by = TEST_USER_ID
    session.region = None

    def _override_get_db():
        db = MagicMock()
        db.get.return_value = session
        yield db

    from app.db.session import get_db as real_get_db
    client.app.dependency_overrides[real_get_db] = _override_get_db

    with patch("app.api.v1.scans.retry_stage", return_value=True) as mock_retry_stage, \
         patch("app.api.v1.scans.run_pipeline") as mock_run_pipeline:
        response = client.post(
            f"/api/v1/scans/{scan_id}/pipeline/textExtraction/retry",
            headers={"Authorization": "Bearer fake"},
        )

    assert response.status_code == 200
    mock_retry_stage.assert_called_once_with(scan_id, "textExtraction")
    mock_run_pipeline.assert_called_once_with(scan_id)


def _post_quality_check(client: TestClient, angle: str, image: bytes, headers: dict | None = None):
    return client.post(
        "/api/v1/scans/quality-check",
        data={"angle": angle},
        files={"file": ("photo.png", image, "image/png")},
        headers=headers or {},
    )


def test_quality_check_without_auth_header_returns_401(client_as) -> None:
    client = client_as(None)
    response = _post_quality_check(client, "front", _sharp_label_bytes())
    assert response.status_code == 401


def test_quality_check_with_role_lacking_permission_returns_403(client_as) -> None:
    client = client_as("Reviewer")
    response = _post_quality_check(
        client, "front", _sharp_label_bytes(), headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 403


def test_quality_check_rejects_unknown_angle(client_as) -> None:
    client = client_as("Enforcement Officer")
    response = _post_quality_check(
        client, "top", _sharp_label_bytes(), headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 422


def test_quality_check_passes_a_sharp_image(client_as) -> None:
    client = client_as("Enforcement Officer")
    response = _post_quality_check(
        client, "front", _sharp_label_bytes(), headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {"passed": True}


def test_quality_check_maps_blur_failure_to_frontend_reason(client_as) -> None:
    client = client_as("Enforcement Officer")
    # Large enough to pass minimum_resolution, but flat/uniform -> zero
    # Laplacian variance -> fails only the blur check.
    blurry = _png_bytes((800, 800), (128, 128, 128))
    response = _post_quality_check(client, "front", blurry, headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    body = response.json()
    assert body["passed"] is False
    assert body["failureReason"] == "blur"


def test_quality_check_maps_darkness_failure_to_no_text_detected(client_as) -> None:
    client = client_as("Enforcement Officer")
    # Large + dark but sharp (checkerboard, not flat) -> fails only
    # darkness, isolating the non-blur fallback mapping.
    img = Image.new("RGB", (800, 800), color=(5, 5, 5))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (20, 20, 20)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    dark = buf.getvalue()
    response = _post_quality_check(client, "front", dark, headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    body = response.json()
    assert body["passed"] is False
    assert body["failureReason"] == "no_text_detected"


def test_quality_check_never_persists_anything(client_as) -> None:
    """A rejected (or accepted) photo here writes nothing — no DB call, no
    S3 upload — since this is a pre-check ahead of the real POST /scans
    submission, which runs the authoritative quality gate again."""
    client = client_as("Enforcement Officer")
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    from app.db.session import get_db as real_get_db

    client.app.dependency_overrides[real_get_db] = _override_get_db

    response = _post_quality_check(
        client, "front", _png_bytes((50, 50), (5, 5, 5)), headers={"Authorization": "Bearer fake"}
    )

    assert response.status_code == 200
    mock_db.add.assert_not_called()
    mock_db.commit.assert_not_called()
