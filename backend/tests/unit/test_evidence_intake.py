"""
Unit tests for services/scans/intake.py::accept_evidence_image() — the ONE
authoritative quality+storage decision point shared by desktop upload-once
capture (OP-Phase 1) and Mobile QR Handoff. Mocked DB session and S3
client, no real Postgres/B2 — same convention as test_scans_endpoint.py.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from PIL import Image

from app.core.config import get_settings
from app.services.image_quality import QualityVerdict
from app.services.scans.intake import AcceptanceState, _acceptance_state, accept_evidence_image

SCAN_SESSION_ID = uuid.uuid4()
ACTOR_ID = uuid.uuid4()


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


def _tiny_dark_bytes() -> bytes:
    """Reliably RECAPTURE_REQUIRED — matches test_image_quality.py's own
    fixture for the same guarantee."""
    return _png_bytes((50, 50), (10, 10, 10))


def _mock_db(existing=None):
    db = MagicMock()
    db.query.return_value.filter.return_value.filter.return_value.first.return_value = existing
    return db


class _FakeS3:
    def __init__(self):
        self.put_calls: list[dict] = []
        self.delete_calls: list[str] = []

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)

    def delete_object(self, **kwargs):
        self.delete_calls.append(kwargs["Key"])


# --- _acceptance_state, pure ------------------------------------------------


def test_acceptance_state_pass_maps_to_pass() -> None:
    assert _acceptance_state(QualityVerdict.PASS, None) == AcceptanceState.PASS


def test_acceptance_state_review_maps_to_pass_with_warnings() -> None:
    assert _acceptance_state(QualityVerdict.REVIEW, None) == AcceptanceState.PASS_WITH_WARNINGS
    # An override reason on a REVIEW image is simply ignored — only a
    # RECAPTURE_REQUIRED verdict can be overridden.
    assert _acceptance_state(QualityVerdict.REVIEW, "not needed") == AcceptanceState.PASS_WITH_WARNINGS


def test_acceptance_state_recapture_required_without_reason_stays_blocked() -> None:
    assert _acceptance_state(QualityVerdict.RECAPTURE_REQUIRED, None) == AcceptanceState.RECAPTURE_REQUIRED


def test_acceptance_state_recapture_required_with_reason_becomes_overridden() -> None:
    assert (
        _acceptance_state(QualityVerdict.RECAPTURE_REQUIRED, "Only photo obtainable, label is worn")
        == AcceptanceState.OVERRIDDEN
    )


# --- accept_evidence_image ---------------------------------------------------


def test_accepts_and_persists_a_good_image() -> None:
    db = _mock_db()
    fake_s3 = _FakeS3()
    with patch("app.services.scans.intake.get_s3_client", return_value=fake_s3):
        result = accept_evidence_image(
            db, get_settings(),
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=_sharp_label_bytes(), content_type="image/png",
            actor_id=ACTOR_ID,
        )
    assert result.acceptance_state in (AcceptanceState.PASS, AcceptanceState.PASS_WITH_WARNINGS)
    assert result.evidence_image is not None
    assert result.is_replacement is False
    assert len(fake_s3.put_calls) == 1
    db.add.assert_any_call(result.evidence_image)
    # One AuditEvent (uploaded, not replaced) alongside the EvidenceImage.
    added_types = [call.args[0] for call in db.add.call_args_list]
    audit_events = [a for a in added_types if hasattr(a, "event_type")]
    assert len(audit_events) == 1
    assert audit_events[0].event_type == "evidence_image_uploaded"


def test_refuses_recapture_required_image_without_override_and_persists_nothing() -> None:
    db = _mock_db()
    fake_s3 = _FakeS3()
    with patch("app.services.scans.intake.get_s3_client", return_value=fake_s3):
        result = accept_evidence_image(
            db, get_settings(),
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=_tiny_dark_bytes(), content_type="image/png",
            actor_id=ACTOR_ID,
        )
    assert result.acceptance_state == AcceptanceState.RECAPTURE_REQUIRED
    assert result.evidence_image is None
    assert fake_s3.put_calls == []
    db.add.assert_not_called()


def test_override_reason_persists_recapture_required_image_as_overridden() -> None:
    db = _mock_db()
    fake_s3 = _FakeS3()
    with patch("app.services.scans.intake.get_s3_client", return_value=fake_s3):
        result = accept_evidence_image(
            db, get_settings(),
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=_tiny_dark_bytes(), content_type="image/png",
            actor_id=ACTOR_ID, override_reason="Only photo obtainable, label is worn",
        )
    assert result.acceptance_state == AcceptanceState.OVERRIDDEN
    assert result.evidence_image is not None
    assert result.evidence_image.override_reason == "Only photo obtainable, label is worn"
    assert result.evidence_image.overridden_by == ACTOR_ID
    assert result.evidence_image.overridden_at is not None
    assert len(fake_s3.put_calls) == 1
    # Two AuditEvents: the uploaded one, plus a distinct override-submitted one.
    added_types = [call.args[0] for call in db.add.call_args_list]
    audit_events = [a for a in added_types if hasattr(a, "event_type")]
    event_types = {e.event_type for e in audit_events}
    assert event_types == {"evidence_image_uploaded", "evidence_override_submitted"}


def test_retake_supersedes_prior_image_for_the_same_angle() -> None:
    existing = MagicMock()
    existing.storage_key = "evidence/old/front-abc123.png"
    db = _mock_db(existing=existing)
    fake_s3 = _FakeS3()
    with patch("app.services.scans.intake.get_s3_client", return_value=fake_s3):
        result = accept_evidence_image(
            db, get_settings(),
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=_sharp_label_bytes(), content_type="image/png",
            actor_id=ACTOR_ID,
        )
    assert result.is_replacement is True
    db.delete.assert_called_once_with(existing)
    assert fake_s3.delete_calls == ["evidence/old/front-abc123.png"]
    added_types = [call.args[0] for call in db.add.call_args_list]
    audit_events = [a for a in added_types if hasattr(a, "event_type")]
    assert audit_events[0].event_type == "evidence_image_replaced"


def test_unsupported_content_type_rejected_as_422() -> None:
    db = _mock_db()
    with pytest.raises(HTTPException) as exc_info:
        accept_evidence_image(
            db, get_settings(),
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=b"not an image", content_type="application/pdf",
            actor_id=ACTOR_ID,
        )
    assert exc_info.value.status_code == 422
    db.add.assert_not_called()


def test_oversized_file_rejected_as_413() -> None:
    db = _mock_db()
    tiny_limit_settings = get_settings().model_copy(update={"mobile_upload_max_mb": 0})
    with pytest.raises(HTTPException) as exc_info:
        accept_evidence_image(
            db, tiny_limit_settings,
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=_sharp_label_bytes(), content_type="image/png",
            actor_id=ACTOR_ID,
        )
    assert exc_info.value.status_code == 413
    db.add.assert_not_called()


def test_mobile_side_actor_id_none_is_valid() -> None:
    """The phone side has no Profile to attribute an upload to — actor_id
    must be accepted as None, matching mobile_handoff.py's own precedent."""
    db = _mock_db()
    fake_s3 = _FakeS3()
    with patch("app.services.scans.intake.get_s3_client", return_value=fake_s3):
        result = accept_evidence_image(
            db, get_settings(),
            scan_session_id=SCAN_SESSION_ID, angle="front",
            file_bytes=_sharp_label_bytes(), content_type="image/png",
            actor_id=None,
        )
    assert result.evidence_image is not None
    added_types = [call.args[0] for call in db.add.call_args_list]
    audit_events = [a for a in added_types if hasattr(a, "event_type")]
    assert audit_events[0].actor_id is None
