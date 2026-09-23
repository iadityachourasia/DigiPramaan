"""
Unit tests for services/audit/emit.py::emit() — the shared AuditEvent
constructor every mutation call site now goes through.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
import structlog

from app.db.models import AuditEvent
from app.services.audit.emit import emit


class _Profile:
    def __init__(self, role: str = "Enforcement Officer") -> None:
        self.id = uuid.uuid4()
        self.role = role


class _Record:
    def __init__(self, region: str = "Maharashtra") -> None:
        self.id = uuid.uuid4()
        self.region = region


def _fake_profile(role: str = "Enforcement Officer") -> _Profile:
    return _Profile(role)


def _fake_record(region: str = "Maharashtra") -> _Record:
    return _Record(region)


def test_unrecognized_event_type_raises() -> None:
    with pytest.raises(ValueError, match="Unrecognized activity event type"):
        emit(MagicMock(), "not_a_real_event_type")


def test_emit_adds_to_session_and_never_commits() -> None:
    db = MagicMock()
    emit(db, "scan_created", viewer=_fake_profile())
    db.add.assert_called_once()
    db.commit.assert_not_called()
    added = db.add.call_args[0][0]
    assert isinstance(added, AuditEvent)


def test_system_actor_has_no_actor_fields() -> None:
    db = MagicMock()
    emit(db, "ocr_completed")
    event = db.add.call_args[0][0]
    assert event.actor_id is None
    assert event.actor_role is None


def test_viewer_populates_actor_fields() -> None:
    db = MagicMock()
    profile = _fake_profile(role="Admin")
    emit(db, "record_archived", viewer=profile)
    event = db.add.call_args[0][0]
    assert event.actor_id == profile.id
    assert event.actor_role == "Admin"


def test_raw_actor_id_used_when_no_viewer_profile_is_loaded() -> None:
    """scans.py::create_scan_session_from_images only ever has a bare
    created_by UUID in scope, not a loaded Profile."""
    db = MagicMock()
    raw_id = uuid.uuid4()
    emit(db, "scan_created", actor_id=raw_id)
    event = db.add.call_args[0][0]
    assert event.actor_id == raw_id
    assert event.actor_role is None


def test_viewer_wins_over_raw_actor_id_when_both_given() -> None:
    db = MagicMock()
    profile = _fake_profile(role="Admin")
    emit(db, "record_archived", viewer=profile, actor_id=uuid.uuid4(), actor_role="Reviewer")
    event = db.add.call_args[0][0]
    assert event.actor_id == profile.id
    assert event.actor_role == "Admin"


def test_record_auto_fills_entity_and_record_fields() -> None:
    db = MagicMock()
    record = _fake_record(region="Delhi")
    emit(db, "field_corrected", record=record, detail={"fieldId": "genericName"})
    event = db.add.call_args[0][0]
    assert event.entity_type == "ComplianceRecord"
    assert event.entity_id == record.id
    assert event.record_id == record.id
    assert event.region == "Delhi"
    assert event.detail == {"fieldId": "genericName"}


def test_region_override_used_when_no_record_object_exists_yet() -> None:
    """A ScanSession's own region, known before any ComplianceRecord
    exists (during OCR/structuring)."""
    db = MagicMock()
    emit(db, "scan_created", actor_id=uuid.uuid4(), region="Maharashtra")
    event = db.add.call_args[0][0]
    assert event.region == "Maharashtra"
    assert event.record_id is None


def test_record_region_wins_over_region_override_when_both_given() -> None:
    db = MagicMock()
    record = _fake_record(region="Delhi")
    emit(db, "confirm_and_verify", record=record, region="Maharashtra")
    event = db.add.call_args[0][0]
    assert event.region == "Delhi"


def test_explicit_entity_overrides_record_derived_default() -> None:
    """A mobile-handoff-style event whose entity is a ScanSession, not
    the record it may eventually produce."""
    db = MagicMock()
    scan_id = uuid.uuid4()
    emit(
        db,
        "mobile_handoff_created",
        viewer=_fake_profile(),
        entity_type="ScanSession",
        entity_id=scan_id,
    )
    event = db.add.call_args[0][0]
    assert event.entity_type == "ScanSession"
    assert event.entity_id == scan_id
    assert event.record_id is None
    assert event.region is None


def test_request_id_read_from_structlog_contextvars() -> None:
    db = MagicMock()
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id="req-abc-123")
    try:
        emit(db, "confirm_and_verify", viewer=_fake_profile())
        event = db.add.call_args[0][0]
        assert event.request_id == "req-abc-123"
    finally:
        structlog.contextvars.clear_contextvars()


def test_no_request_id_bound_is_none_not_a_crash() -> None:
    db = MagicMock()
    structlog.contextvars.clear_contextvars()
    emit(db, "confirm_and_verify", viewer=_fake_profile())
    event = db.add.call_args[0][0]
    assert event.request_id is None
