"""
Unit tests for the P2 hardening fixes (2026-09-19) to
app/core/logging.py: mobile-handoff token redaction in the request-
completed log line (F-008), and X-Request-ID format/length validation
(F-019).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.logging import _redact_path


def test_redact_path_masks_the_mobile_handoff_token() -> None:
    raw = "/api/v1/mobile-handoff/AbCdEf1234567890-_super-secret-token/images/front"
    redacted = _redact_path(raw)
    assert "AbCdEf1234567890-_super-secret-token" not in redacted
    assert redacted == "/api/v1/mobile-handoff/***/images/front"


def test_redact_path_masks_bare_status_route_too() -> None:
    raw = "/api/v1/mobile-handoff/some-raw-token-value"
    assert _redact_path(raw) == "/api/v1/mobile-handoff/***"


def test_redact_path_leaves_unrelated_paths_unchanged() -> None:
    raw = "/api/v1/records/11111111-1111-1111-1111-111111111111"
    assert _redact_path(raw) == raw


def test_well_formed_inbound_request_id_is_echoed_back(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "a-valid-id-123"})
    assert response.headers["X-Request-ID"] == "a-valid-id-123"


def test_malformed_inbound_request_id_is_replaced_not_echoed(client: TestClient) -> None:
    malformed = "has spaces and $ymbols !!"
    response = client.get("/api/v1/health", headers={"X-Request-ID": malformed})
    assert response.headers["X-Request-ID"] != malformed
    # Still a well-formed value (a fresh UUID).
    import uuid

    uuid.UUID(response.headers["X-Request-ID"])


def test_oversized_inbound_request_id_is_replaced() -> None:
    from app.core.logging import _REQUEST_ID_RE

    too_long = "a" * 65
    assert not _REQUEST_ID_RE.match(too_long)
    ok_length = "a" * 64
    assert _REQUEST_ID_RE.match(ok_length)


def test_no_request_id_header_still_gets_a_generated_one(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert "X-Request-ID" in response.headers
    assert len(response.headers["X-Request-ID"]) > 0
