"""
/health is pure liveness — no dependency calls — so it must pass on every
machine, Docker or not.

/health/ready's *shape and never-crashes* guarantee is also environment-
independent and belongs here: it must return a well-formed body naming both
checks (database, object storage — no Redis/MinIO in the MVP stack) and
never raise an unhandled 500, whether dependencies are up or down. Whether
it reports fully healthy (200) requires live infrastructure and is asserted
precisely by tests/integration/test_readiness_live.py — deliberately not
duplicated here.
"""

from fastapi.testclient import TestClient


def test_liveness_always_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_liveness_carries_request_id_header(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert "X-Request-ID" in response.headers


def test_readiness_returns_well_formed_body_regardless_of_dependency_state(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/health/ready")

    # Never an unhandled 500 — only ever a clean 200 (all healthy) or 503
    # (one or more dependencies down), no matter what state they're in.
    assert response.status_code in (200, 503)
    body = response.json()
    assert set(body["checks"].keys()) == {"database", "object_storage"}
    assert body["status"] in ("ready", "not_ready")
    for check in body["checks"].values():
        assert "ok" in check
        if not check["ok"]:
            assert "error" in check
