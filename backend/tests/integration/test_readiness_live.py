"""
Asserts /health/ready reports fully healthy — 200, every check true — when
Supabase Postgres and Backblaze B2 are genuinely reachable. This is the live-infra
counterpart to tests/unit/test_health.py's degradation test, which only
proves the code degrades correctly when dependencies are absent. Excluded
from the default `pytest` run; run explicitly with `pytest -m integration`.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

pytestmark = pytest.mark.integration


def test_readiness_reports_healthy_when_infrastructure_is_up() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert all(check["ok"] for check in body["checks"].values())
