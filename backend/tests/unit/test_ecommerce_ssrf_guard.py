"""
Unit tests for services/ecommerce/ssrf_guard.py — the security-critical
piece. No real network calls: `resolve_and_check_host` is exercised via a
monkeypatched `socket.getaddrinfo`, matching how a real DNS response shape
looks (a list of (family, type, proto, canonname, sockaddr) tuples).
"""

from __future__ import annotations

import socket

import pytest

from app.services.ecommerce.ssrf_guard import (
    UnsafeUrlError,
    resolve_and_check_host,
    validate_url_is_safe_to_fetch,
    validate_url_scheme,
)


def _addrinfo(*ips: str) -> list[tuple]:
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in ips]


def test_valid_https_url_returns_hostname():
    assert validate_url_scheme("https://example.com/product/1") == "example.com"


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/file",
        "gopher://example.com",
        "javascript:alert(1)",
    ],
)
def test_disallowed_scheme_rejected(url):
    with pytest.raises(UnsafeUrlError):
        validate_url_scheme(url)


def test_non_standard_port_rejected():
    with pytest.raises(UnsafeUrlError, match="port"):
        validate_url_scheme("http://example.com:8080/")


def test_missing_hostname_rejected():
    with pytest.raises(UnsafeUrlError, match="hostname"):
        validate_url_scheme("http:///no-host")


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",  # loopback
        "10.0.0.5",  # RFC1918
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",  # cloud instance metadata — the canonical SSRF target
        "100.64.0.1",  # CGNAT
        "0.0.0.0",
        "::1",  # loopback v6
        "fc00::1",  # unique local v6
        "fe80::1",  # link-local v6
    ],
)
def test_disallowed_ip_rejected(monkeypatch, ip):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: _addrinfo(ip))
    with pytest.raises(UnsafeUrlError, match="disallowed"):
        resolve_and_check_host("evil.example.com")


def test_public_ip_accepted(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))
    ips = resolve_and_check_host("example.com")
    assert ips == ["93.184.216.34"]


def test_multi_answer_dns_rejected_if_any_answer_is_unsafe(monkeypatch):
    """A safe IP first and a disallowed one second must still be rejected —
    checking only the first answer would miss this."""
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34", "169.254.169.254")
    )
    with pytest.raises(UnsafeUrlError):
        resolve_and_check_host("evil.example.com")


def test_unresolvable_host_rejected(monkeypatch):
    def _raise(*args, **kwargs):
        raise socket.gaierror("Name or service not known")

    monkeypatch.setattr(socket, "getaddrinfo", _raise)
    with pytest.raises(UnsafeUrlError, match="resolve"):
        resolve_and_check_host("does-not-exist.invalid")


def test_validate_url_is_safe_to_fetch_runs_both_checks(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: _addrinfo("169.254.169.254"))
    with pytest.raises(UnsafeUrlError):
        validate_url_is_safe_to_fetch("http://metadata.internal/latest/meta-data/")
