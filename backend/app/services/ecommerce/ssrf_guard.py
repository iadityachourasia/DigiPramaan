"""
services/ecommerce/ssrf_guard.py — the one place a server-side fetch of a
user-submitted URL gets validated before any socket connects.

This is the security-critical piece of the E-commerce Listing Scanner: an
officer submits an arbitrary URL, and this backend fetches it. Without
these checks, that's a textbook SSRF primitive — a URL could point at
`http://169.254.169.254/...` (cloud instance metadata), an internal
service on `10.x`/`172.16-31.x`/`192.168.x`, or `localhost` itself.

Two checks, run in this order, by every caller in this package:
  1. `validate_url_scheme` — reject before any DNS lookup happens.
  2. `resolve_and_check_host` — resolve every A/AAAA record for the
     hostname and reject if ANY of them lands in a disallowed range.

Both must be re-run on EVERY redirect hop, not just the original URL —
`fetcher.py` handles redirects manually (`follow_redirects=False`) for
exactly this reason. A single up-front check does not cover a malicious
redirect target.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),  # loopback
    ipaddress.ip_network("10.0.0.0/8"),  # RFC1918
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local, incl. cloud metadata (169.254.169.254)
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),  # unique local
    ipaddress.ip_network("fe80::/10"),  # link-local v6
]

_ALLOWED_SCHEMES = ("http", "https")
_ALLOWED_PORTS = (None, 80, 443)


class UnsafeUrlError(Exception):
    """A URL failed scheme, port, or IP-range checks — never fetched.
    Deliberately one exception type for every rejection reason: the
    caller maps this to one generic-enough-to-be-safe error response,
    never leaking which specific internal range was hit."""


def validate_url_scheme(url: str) -> str:
    """Rejects anything but a plain http(s) URL on a default port, before
    any network activity. Returns the hostname on success."""
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise UnsafeUrlError("Only http/https URLs are supported")
    if parsed.port not in _ALLOWED_PORTS:
        raise UnsafeUrlError("Non-standard ports are not permitted")
    if not parsed.hostname:
        raise UnsafeUrlError("URL has no hostname")
    return parsed.hostname


def resolve_and_check_host(hostname: str) -> list[str]:
    """Resolves ALL A/AAAA records for `hostname` (not just the first) and
    rejects if ANY of them resolves into a blocked range — a DNS response
    with a safe IP first and a disallowed one second would defeat a
    first-answer-only check. Returns the resolved IPs on success."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Could not resolve host: {hostname}") from exc

    ips = {info[4][0] for info in infos}
    for ip_str in ips:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise UnsafeUrlError(f"Host resolves to a disallowed address ({ip_str})")
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise UnsafeUrlError(f"Host resolves to a disallowed address ({ip_str})")
    return list(ips)


def validate_url_is_safe_to_fetch(url: str) -> None:
    """Both checks, in order. Superseded by
    `validate_url_is_safe_to_fetch_and_pin` (P2 hardening, F-009) for the
    real fetch path — kept as a thin wrapper since some callers only ever
    needed the validation, not a pinned IP to connect to."""
    hostname = validate_url_scheme(url)
    resolve_and_check_host(hostname)


def validate_url_is_safe_to_fetch_and_pin(url: str) -> tuple[str, str]:
    """P2 hardening (2026-09-19, F-009): the DNS-pinning fix. The old
    `validate_url_is_safe_to_fetch` validated a hostname, then the caller
    (fetcher.py) did a SECOND, independent DNS lookup when it actually
    connected (httpx resolves the hostname itself) — a real TOCTOU/DNS-
    rebinding gap, since the IP validated here was never the IP actually
    connected to. Returns `(hostname, pinned_ip)`: the caller connects to
    `pinned_ip` literally (never re-resolving), using `hostname` only for
    TLS SNI/certificate verification and the `Host` header. Picks the
    first validated IP deterministically (list order from
    `resolve_and_check_host`, itself built from a `set` — not literally
    stable across calls for a multi-IP record, but every returned IP has
    already passed the exact same safety check, so which one is picked is
    not a safety-relevant choice)."""
    hostname = validate_url_scheme(url)
    ips = resolve_and_check_host(hostname)
    return hostname, ips[0]
