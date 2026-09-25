"""
Unit tests for services/notifications/recipients.py::jurisdiction_recipients().
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from app.services.notifications.recipients import jurisdiction_recipients


def test_returns_empty_set_when_query_finds_nobody() -> None:
    db = MagicMock()
    q = db.query.return_value
    q.filter.return_value = q
    q.all.return_value = []
    assert jurisdiction_recipients(db, region="Delhi", roles=["Admin"]) == set()


def test_collects_ids_from_query_rows() -> None:
    db = MagicMock()
    ids = [uuid.uuid4(), uuid.uuid4()]
    q = db.query.return_value
    q.filter.return_value = q
    q.all.return_value = [(i,) for i in ids]
    result = jurisdiction_recipients(db, region="Delhi", roles=["Admin", "Reviewer"])
    assert result == set(ids)


def test_region_none_means_no_region_filter_applied() -> None:
    """The national-broadcast case (rule thresholds) — one fewer .filter()
    call than the region-scoped case, since there is nothing to scope by."""
    db = MagicMock()
    q = db.query.return_value
    q.filter.return_value = q
    q.all.return_value = []

    jurisdiction_recipients(db, region=None, roles=["Enforcement Officer"])
    # Only the active + role filters, not a third region-scoping filter.
    assert q.filter.call_count == 2


def test_region_given_adds_a_third_filter_call() -> None:
    db = MagicMock()
    q = db.query.return_value
    q.filter.return_value = q
    q.all.return_value = []

    jurisdiction_recipients(db, region="Delhi", roles=["Admin"])
    assert q.filter.call_count == 3
