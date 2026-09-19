"""
Unit tests for app/services/tickets/download_ticket.py (P2 hardening,
F-010) — issue/verify round trip, expiry, tampering, kind/resource
mismatch. Entirely self-contained (no DB, no network).
"""

from __future__ import annotations

import time
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.tickets.download_ticket import (
    TicketError,
    issue_download_ticket,
    verify_download_ticket,
)

REPORT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
ISSUER_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


def _settings(secret: str = "test-ticket-secret", ttl: int = 120) -> SimpleNamespace:
    return SimpleNamespace(
        download_ticket_secret=MagicMock(get_secret_value=MagicMock(return_value=secret)),
        download_ticket_ttl_seconds=ttl,
    )


def test_issue_then_verify_round_trip_returns_original_claims() -> None:
    settings = _settings()
    ticket = issue_download_ticket(settings, resource_id=REPORT_ID, kind="report", issued_by=ISSUER_ID)
    claims = verify_download_ticket(settings, ticket)
    assert claims.resource_id == REPORT_ID
    assert claims.kind == "report"
    assert claims.issued_by == ISSUER_ID


def test_expired_ticket_rejected() -> None:
    settings = _settings(ttl=-1)
    ticket = issue_download_ticket(settings, resource_id=REPORT_ID, kind="report", issued_by=ISSUER_ID)
    with pytest.raises(TicketError, match="expired"):
        verify_download_ticket(settings, ticket)


def test_tampered_signature_rejected() -> None:
    settings = _settings()
    ticket = issue_download_ticket(settings, resource_id=REPORT_ID, kind="report", issued_by=ISSUER_ID)
    prefix, payload, _signature = ticket.split("-", 2)
    tampered = f"{prefix}-{payload}-{'0' * 64}"
    with pytest.raises(TicketError, match="signature"):
        verify_download_ticket(settings, tampered)


def test_tampered_payload_rejected() -> None:
    """Changing the payload without re-signing must fail — the whole
    point of HMAC-signing it."""
    settings = _settings()
    ticket = issue_download_ticket(settings, resource_id=REPORT_ID, kind="report", issued_by=ISSUER_ID)
    prefix, payload, signature = ticket.split("-", 2)
    tampered_payload = payload[:-1] + ("A" if payload[-1] != "A" else "B")
    tampered = f"{prefix}-{tampered_payload}-{signature}"
    with pytest.raises(TicketError):
        verify_download_ticket(settings, tampered)


def test_wrong_secret_rejected() -> None:
    issuing_settings = _settings(secret="secret-a")
    verifying_settings = _settings(secret="secret-b")
    ticket = issue_download_ticket(
        issuing_settings, resource_id=REPORT_ID, kind="report", issued_by=ISSUER_ID
    )
    with pytest.raises(TicketError, match="signature"):
        verify_download_ticket(verifying_settings, ticket)


def test_malformed_ticket_string_rejected() -> None:
    settings = _settings()
    with pytest.raises(TicketError, match="Malformed"):
        verify_download_ticket(settings, "not-a-real-ticket-at-all")


def test_ticket_never_contains_the_secret_in_plaintext() -> None:
    settings = _settings(secret="super-secret-value-never-leak-me")
    ticket = issue_download_ticket(settings, resource_id=REPORT_ID, kind="report", issued_by=ISSUER_ID)
    assert "super-secret-value-never-leak-me" not in ticket


def test_evidence_image_kind_round_trips_too() -> None:
    settings = _settings()
    ticket = issue_download_ticket(
        settings, resource_id=REPORT_ID, kind="evidence_image", issued_by=ISSUER_ID
    )
    claims = verify_download_ticket(settings, ticket)
    assert claims.kind == "evidence_image"
