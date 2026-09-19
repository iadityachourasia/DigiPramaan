"""
Unit test for the P2 hardening fix (F-006) capping the number of URLs a
single POST /ecommerce/batch request may submit. Mocked DB/current-user,
same convention as test_scans_endpoint.py — no real fetch ever happens
because the cap check runs before the fetch loop starts.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.api.deps.auth import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.main import create_app

TEST_USER_ID = uuid.UUID("77777777-7777-7777-7777-777777777777")


def _fake_profile():
    class _Profile:
        pass

    p = _Profile()
    p.id = TEST_USER_ID
    p.role = "Enforcement Officer"
    p.jurisdiction_level = "National"
    p.region = None
    return p


def _client():
    app = create_app()
    mock_db = MagicMock()

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: _fake_profile()
    return TestClient(app)


def _batch_payload(url_count: int) -> dict:
    return {
        "sourceUrl": "https://example-marketplace.test/category/widgets",
        "selectedUrls": [f"https://example-marketplace.test/item/{i}" for i in range(url_count)],
        "category": "Packaged Food",
        "region": "Maharashtra",
    }


def test_batch_over_the_cap_rejected_with_422_before_any_fetch() -> None:
    client = _client()
    max_urls = get_settings().ecommerce_batch_max_urls
    response = client.post(
        "/api/v1/ecommerce/batch",
        json=_batch_payload(max_urls + 1),
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 422


def test_batch_at_exactly_the_cap_is_not_rejected_by_the_cap_check() -> None:
    """At-the-limit must not be rejected by the COUNT check itself — this
    only proves the guard's boundary is inclusive, not that the whole
    batch succeeds (the mocked DB/fetch layer below the guard isn't wired
    up for a real fetch in this unit test)."""
    client = _client()
    max_urls = get_settings().ecommerce_batch_max_urls
    response = client.post(
        "/api/v1/ecommerce/batch",
        json=_batch_payload(max_urls),
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code != 422
