"""
Unit tests for api/deps/mobile_handoff.py's get_active_handoff — the
security-critical piece that resolves a raw token into a
MobileUploadSession. Mocked DB session (no real network), matching this
project's unit-test convention for dependency-level logic.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.deps.mobile_handoff import get_active_handoff
from app.services.mobile_handoff.tokens import hash_token


def _fake_handoff(**overrides):
    class _Handoff:
        pass

    h = _Handoff()
    h.id = uuid.uuid4()
    h.scan_session_id = uuid.uuid4()
    h.status = "ACTIVE"
    h.expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    for key, value in overrides.items():
        setattr(h, key, value)
    return h


def test_unknown_token_rejected_with_404():
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        get_active_handoff("some-random-token", db=mock_db)
    assert exc_info.value.status_code == 404


def test_active_unexpired_token_returns_handoff():
    handoff = _fake_handoff()
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = handoff

    result = get_active_handoff("whatever", db=mock_db)
    assert result is handoff
    mock_db.commit.assert_not_called()


def test_expired_but_still_marked_active_is_lazily_transitioned_and_rejected():
    handoff = _fake_handoff(
        status="ACTIVE", expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)
    )
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = handoff

    with pytest.raises(HTTPException) as exc_info:
        get_active_handoff("whatever", db=mock_db)
    assert exc_info.value.status_code == 404
    assert handoff.status == "EXPIRED"
    mock_db.commit.assert_called_once()


def test_revoked_token_rejected():
    handoff = _fake_handoff(status="REVOKED")
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = handoff

    with pytest.raises(HTTPException) as exc_info:
        get_active_handoff("whatever", db=mock_db)
    assert exc_info.value.status_code == 404


def test_completed_token_rejected():
    handoff = _fake_handoff(status="COMPLETED")
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = handoff

    with pytest.raises(HTTPException) as exc_info:
        get_active_handoff("whatever", db=mock_db)
    assert exc_info.value.status_code == 404


def test_lookup_uses_hashed_token_not_raw_value():
    """The security property this whole dependency exists for: the raw
    token is never compared or stored directly — only its hash. Inspects
    the real SQLAlchemy filter expression built (MobileUploadSession's
    columns are real, only the Session is mocked), so this fails loudly
    if the lookup is ever changed to compare against the raw token."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    raw_token = "a-raw-token-value"

    with pytest.raises(HTTPException):
        get_active_handoff(raw_token, db=mock_db)

    (filter_expr,), _kwargs = mock_db.query.return_value.filter.call_args
    compared_value = filter_expr.right.value
    assert compared_value == hash_token(raw_token)
    assert compared_value != raw_token
