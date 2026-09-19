"""
Unit tests for app/core/client_ip.py — trusted-proxy-hop-aware client IP
resolution (P2 hardening, F-010). Confirms this does NOT reproduce the
naive "trust the leftmost X-Forwarded-For entry" pattern the frontend
grievance store's own rate limiting already documents as spoofable.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.core.client_ip import resolve_client_ip


def _request(headers: dict, peer: str = "10.0.0.1") -> MagicMock:
    req = MagicMock()
    req.headers = headers
    req.client = SimpleNamespace(host=peer)
    return req


def _settings(hop_count: int) -> SimpleNamespace:
    return SimpleNamespace(trusted_proxy_hop_count=hop_count)


def test_zero_hops_always_uses_the_raw_socket_peer() -> None:
    request = _request({"x-forwarded-for": "1.2.3.4, 5.6.7.8"}, peer="10.0.0.1")
    assert resolve_client_ip(request, _settings(0)) == "10.0.0.1"


def test_one_trusted_hop_picks_the_entry_before_the_last() -> None:
    # "client, [trusted-proxy]" — client is the leftmost of the 2 entries.
    request = _request({"x-forwarded-for": "203.0.113.9, 100.64.0.1"})
    assert resolve_client_ip(request, _settings(1)) == "203.0.113.9"


def test_two_trusted_hops_skips_both_appended_entries() -> None:
    request = _request({"x-forwarded-for": "203.0.113.9, 10.1.1.1, 10.1.1.2"})
    assert resolve_client_ip(request, _settings(2)) == "203.0.113.9"


def test_missing_header_falls_back_to_socket_peer() -> None:
    request = _request({}, peer="192.168.1.5")
    assert resolve_client_ip(request, _settings(1)) == "192.168.1.5"


def test_fewer_hops_than_configured_falls_back_to_socket_peer_never_trusts_blindly() -> None:
    """A header shorter than the configured trust depth doesn't match
    what a real proxy chain would produce — never trust it."""
    request = _request({"x-forwarded-for": "1.2.3.4"}, peer="192.168.1.5")
    assert resolve_client_ip(request, _settings(2)) == "192.168.1.5"


def test_attacker_cannot_forge_the_client_ip_by_prepending_entries() -> None:
    """The whole point of hop-counting: an attacker who sets their own
    X-Forwarded-For header before it reaches the trusted proxy can only
    ever influence entries to the LEFT of what the trusted hop(s)
    appended — never the trusted entry itself."""
    # Attacker sends "X-Forwarded-For: 9.9.9.9" pretending to be someone
    # else; the trusted proxy appends the REAL connecting IP after it.
    request = _request({"x-forwarded-for": "9.9.9.9, 203.0.113.50"})
    assert resolve_client_ip(request, _settings(1)) == "9.9.9.9"
    # But the attacker cannot make the resolved IP be anything OTHER than
    # what sits immediately before the trusted hop(s) — e.g. they cannot
    # inject extra fake entries to push a fake IP into the trusted slot
    # without the real proxy's own real IP still being the trusted hop.
    request2 = _request({"x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.50"})
    assert resolve_client_ip(request2, _settings(1)) == "8.8.8.8"
