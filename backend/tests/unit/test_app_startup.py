"""
Regression test for a real Phase 0 bug: the object-storage bucket-creation
startup hook (app.core.object_storage.ensure_bucket_exists) originally
caught only `ClientError`, but an unreachable endpoint raises
`BotoCoreError` (e.g. `EndpointConnectionError`) instead — which propagated
out of the FastAPI lifespan and crashed app startup entirely. Every
existing test passed anyway, because the `client` fixture built a
`TestClient` without entering it as a context manager, so lifespan events
were never exercised — the bug was only caught by a live `uvicorn` smoke
test. This test closes that gap: it enters the lifespan explicitly and
must never raise, MinIO reachable or not.
"""

from fastapi.testclient import TestClient

from app.main import create_app


def test_app_starts_cleanly_even_when_object_storage_is_unreachable() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
