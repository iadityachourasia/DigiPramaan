"""
Unit tests for services/ecommerce/fetcher.py — network mocked via respx
(no real HTTP), DNS resolution mocked via socket.getaddrinfo so the
ssrf_guard checks inside every fetch see a safe public IP for the test
domain rather than hitting real DNS.
"""

from __future__ import annotations

import socket
from types import SimpleNamespace

import httpx
import pytest
import respx

from app.services.ecommerce.fetcher import FetchError, fetch_image_bytes, fetch_listing_html


def _settings(**overrides) -> SimpleNamespace:
    defaults = dict(
        ecommerce_fetch_timeout_seconds=5.0,
        ecommerce_max_html_bytes=1000,
        ecommerce_max_image_bytes=1000,
        ecommerce_max_redirects=3,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.fixture(autouse=True)
def _safe_dns(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))],
    )


@respx.mock
def test_fetches_html_successfully():
    respx.get("https://shop.example.com/product/1").mock(
        return_value=httpx.Response(200, headers={"content-type": "text/html"}, text="<html>ok</html>")
    )
    html = fetch_listing_html("https://shop.example.com/product/1", _settings())
    assert html == "<html>ok</html>"


@respx.mock
def test_disallowed_content_type_rejected():
    respx.get("https://shop.example.com/product/1").mock(
        return_value=httpx.Response(200, headers={"content-type": "application/pdf"}, content=b"%PDF-1.4")
    )
    with pytest.raises(FetchError, match="content-type"):
        fetch_listing_html("https://shop.example.com/product/1", _settings())


@respx.mock
def test_html_size_cap_aborts_before_buffering_the_whole_body():
    oversized = b"<html>" + (b"x" * 2000) + b"</html>"
    respx.get("https://shop.example.com/big").mock(
        return_value=httpx.Response(200, headers={"content-type": "text/html"}, content=oversized)
    )
    with pytest.raises(FetchError, match="byte cap"):
        fetch_listing_html("https://shop.example.com/big", _settings(ecommerce_max_html_bytes=100))


@respx.mock
def test_image_fetched_with_content_type():
    respx.get("https://shop.example.com/img.jpg").mock(
        return_value=httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"\xff\xd8\xff")
    )
    body, content_type = fetch_image_bytes("https://shop.example.com/img.jpg", _settings())
    assert body == b"\xff\xd8\xff"
    assert content_type == "image/jpeg"


@respx.mock
def test_image_disallowed_content_type_rejected():
    respx.get("https://shop.example.com/not-an-image").mock(
        return_value=httpx.Response(200, headers={"content-type": "text/html"}, text="<html></html>")
    )
    with pytest.raises(FetchError):
        fetch_image_bytes("https://shop.example.com/not-an-image", _settings())


@respx.mock
def test_redirect_to_safe_host_followed():
    respx.get("https://shop.example.com/old").mock(
        return_value=httpx.Response(302, headers={"location": "https://shop.example.com/new"})
    )
    respx.get("https://shop.example.com/new").mock(
        return_value=httpx.Response(200, headers={"content-type": "text/html"}, text="<html>new</html>")
    )
    html = fetch_listing_html("https://shop.example.com/old", _settings())
    assert html == "<html>new</html>"


def test_redirect_to_unsafe_host_rejected(monkeypatch):
    """The regression case for "a redirect could bypass an initial IP
    check": hop 1 resolves to a public IP, hop 2's target resolves to the
    cloud metadata address — the second hop must be re-checked from
    scratch, not waved through because the first hop passed."""

    def fake_getaddrinfo(host, *a, **k):
        if host == "shop.example.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    with respx.mock:
        respx.get("https://shop.example.com/old").mock(
            return_value=httpx.Response(302, headers={"location": "http://internal.evil.com/secret"})
        )
        with pytest.raises(FetchError, match="disallowed"):
            fetch_listing_html("https://shop.example.com/old", _settings())


@respx.mock
def test_too_many_redirects_rejected():
    respx.get("https://shop.example.com/a").mock(
        return_value=httpx.Response(302, headers={"location": "https://shop.example.com/b"})
    )
    respx.get("https://shop.example.com/b").mock(
        return_value=httpx.Response(302, headers={"location": "https://shop.example.com/a"})
    )
    with pytest.raises(FetchError, match="redirects"):
        fetch_listing_html("https://shop.example.com/a", _settings(ecommerce_max_redirects=2))
