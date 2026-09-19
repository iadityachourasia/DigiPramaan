"""
Unit tests for app/services/admin/thresholds.py — the append-only
rule-threshold-versioning helper backing Admin Console's GET/PUT
/admin/thresholds. Mocked DB session, no real Postgres.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from app.services.admin.thresholds import DEFAULT_THRESHOLDS, get_effective_thresholds, set_thresholds


def test_get_effective_thresholds_falls_back_to_defaults_when_no_row_exists():
    db = MagicMock()
    db.query.return_value.order_by.return_value.first.return_value = None
    result = get_effective_thresholds(db)
    assert result == DEFAULT_THRESHOLDS
    assert result is not DEFAULT_THRESHOLDS  # a copy, never the shared module dict itself


def test_get_effective_thresholds_returns_the_latest_row_merged_over_defaults():
    db = MagicMock()
    latest = MagicMock()
    latest.values = {"repeatViolationCount": 5}
    db.query.return_value.order_by.return_value.first.return_value = latest
    result = get_effective_thresholds(db)
    assert result["repeatViolationCount"] == 5
    # Every other default still present — a partial override never drops
    # the fields it doesn't mention.
    assert result["repeatViolationDays"] == DEFAULT_THRESHOLDS["repeatViolationDays"]


def test_set_thresholds_inserts_a_new_row_never_updates_in_place():
    db = MagicMock()
    actor_id = uuid.uuid4()
    version = set_thresholds(db, values={"repeatViolationCount": 10}, created_by=actor_id)
    db.add.assert_called_once()
    db.flush.assert_called_once()
    assert version.values == {"repeatViolationCount": 10}
    assert version.created_by == actor_id
