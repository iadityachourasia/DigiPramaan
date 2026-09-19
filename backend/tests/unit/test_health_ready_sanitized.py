"""
Unit tests for the P2 hardening fix (F-019) to GET /health/ready: a
forced dependency failure must never put the raw exception text in the
response body (only a fixed reason code), while the full text still
reaches the server-side log.
"""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError


def test_database_failure_never_leaks_the_raw_exception_text(client: TestClient) -> None:
    secret_looking_error = "connection to server at aws-0-x.pooler.supabase.com failed: password authentication failed for user 'postgres'"
    with patch(
        "app.api.v1.health._check_database",
        return_value=(False, secret_looking_error),
    ):
        response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    body_text = response.text
    assert secret_looking_error not in body_text
    assert body_text.count("password") == 0
    checks = response.json()["checks"]
    assert checks["database"] == {"ok": False, "reason": "database_unreachable"}


def test_object_storage_failure_never_leaks_the_raw_exception_text(client: TestClient) -> None:
    secret_looking_error = "An error occurred (AccessDenied) when calling the HeadBucket operation: Access Denied for key AKIAFAKE123"
    with patch(
        "app.api.v1.health._check_object_storage",
        return_value=(False, secret_looking_error),
    ):
        response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert secret_looking_error not in response.text
    checks = response.json()["checks"]
    assert checks["object_storage"] == {"ok": False, "reason": "storage_unreachable"}


def test_failure_is_logged_server_side_with_the_full_text(client: TestClient) -> None:
    secret_looking_error = "detailed connection failure reason"
    with patch(
        "app.api.v1.health._check_database", return_value=(False, secret_looking_error)
    ), patch("app.api.v1.health.logger") as mock_logger:
        client.get("/api/v1/health/ready")

    mock_logger.warning.assert_called_once_with(
        "readiness_check_failed", check="database", error=secret_looking_error
    )


def test_all_healthy_returns_200_with_no_reason_keys(client: TestClient) -> None:
    with patch("app.api.v1.health._check_database", return_value=(True, None)), patch(
        "app.api.v1.health._check_object_storage", return_value=(True, None)
    ):
        response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    checks = response.json()["checks"]
    assert checks == {"database": {"ok": True}, "object_storage": {"ok": True}}
