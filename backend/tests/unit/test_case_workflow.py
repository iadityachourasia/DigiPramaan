"""Unit tests for app/services/cases/workflow.py — pure state machine."""

from __future__ import annotations

from app.services.cases.workflow import CASE_STATUSES, validate_transition


def test_all_five_statuses_present() -> None:
    assert CASE_STATUSES == frozenset({
        "OPEN", "ACTION_REQUIRED", "REINSPECTION_REQUIRED", "RESOLVED", "CLOSED",
    })


def test_open_can_move_to_action_required_or_closed() -> None:
    assert validate_transition("OPEN", "ACTION_REQUIRED") is True
    assert validate_transition("OPEN", "CLOSED") is True


def test_open_cannot_skip_to_resolved() -> None:
    assert validate_transition("OPEN", "RESOLVED") is False


def test_action_required_can_move_to_reinspection_resolved_or_closed() -> None:
    assert validate_transition("ACTION_REQUIRED", "REINSPECTION_REQUIRED") is True
    assert validate_transition("ACTION_REQUIRED", "RESOLVED") is True
    assert validate_transition("ACTION_REQUIRED", "CLOSED") is True


def test_reinspection_required_can_return_to_action_required_on_failure() -> None:
    assert validate_transition("REINSPECTION_REQUIRED", "ACTION_REQUIRED") is True


def test_resolved_can_reopen_to_reinspection_required() -> None:
    assert validate_transition("RESOLVED", "REINSPECTION_REQUIRED") is True


def test_closed_is_strictly_terminal() -> None:
    for target in CASE_STATUSES:
        assert validate_transition("CLOSED", target) is False


def test_unknown_from_status_rejects_everything() -> None:
    assert validate_transition("NOT_A_REAL_STATUS", "OPEN") is False
