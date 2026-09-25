"""
Unit tests for services/notifications/notify.py — notify()/notify_many(),
the shared Notification constructors every trigger site goes through.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from app.db.models import Notification
from app.services.notifications.notify import notify, notify_many


class _Record:
    def __init__(self, id_: uuid.UUID | None = None) -> None:
        self.id = id_ or uuid.uuid4()


def test_unrecognized_notification_type_raises() -> None:
    with pytest.raises(ValueError, match="Unrecognized notification type"):
        notify(MagicMock(), uuid.uuid4(), "not_a_real_type")


def test_notify_adds_to_session_and_never_commits() -> None:
    db = MagicMock()
    recipient = uuid.uuid4()
    notify(db, recipient, "account_created", detail={"role": "Enforcement Officer"})
    db.add.assert_called_once()
    db.commit.assert_not_called()
    added = db.add.call_args[0][0]
    assert isinstance(added, Notification)
    assert added.recipient_id == recipient
    assert added.type == "account_created"


def test_notify_returns_none_and_no_op_when_recipient_is_none() -> None:
    db = MagicMock()
    result = notify(db, None, "account_created")
    assert result is None
    db.add.assert_not_called()


def test_notify_auto_fills_entity_and_record_from_record() -> None:
    db = MagicMock()
    record = _Record()
    notify(db, uuid.uuid4(), "record_flagged_needs_review", record=record, detail={"note": "check MRP"})
    added = db.add.call_args[0][0]
    assert added.record_id == record.id
    assert added.entity_type == "ComplianceRecord"
    assert added.entity_id == record.id
    assert added.detail == {"note": "check MRP"}


def test_notify_explicit_entity_overrides_record_derived_default() -> None:
    db = MagicMock()
    record = _Record()
    case_id = uuid.uuid4()
    notify(
        db, uuid.uuid4(), "case_status_changed",
        record=record, entity_type="ViolationCase", entity_id=case_id,
    )
    added = db.add.call_args[0][0]
    assert added.entity_type == "ViolationCase"
    assert added.entity_id == case_id
    # record_id is still populated — a case notification still names its
    # originating record for the notification list's "your record" link.
    assert added.record_id == record.id


def test_notify_many_inserts_one_row_per_recipient() -> None:
    db = MagicMock()
    recipients = {uuid.uuid4(), uuid.uuid4(), uuid.uuid4()}
    notify_many(db, recipients, "rule_thresholds_changed", detail={"ocrConfidenceThreshold": 70})
    db.add_all.assert_called_once()
    db.commit.assert_not_called()
    added = db.add_all.call_args[0][0]
    assert {n.recipient_id for n in added} == recipients
    assert all(n.type == "rule_thresholds_changed" for n in added)


def test_notify_many_empty_recipients_is_silent_no_op() -> None:
    db = MagicMock()
    result = notify_many(db, set(), "rule_thresholds_changed")
    assert result == []
    db.add_all.assert_not_called()


def test_notify_many_unrecognized_type_raises() -> None:
    with pytest.raises(ValueError, match="Unrecognized notification type"):
        notify_many(MagicMock(), {uuid.uuid4()}, "not_a_real_type")
