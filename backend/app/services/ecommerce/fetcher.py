"""
services/ecommerce/fetcher.py — the one place this backend actually fetches
a URL over the network, for both a listing page and any image discovered on
it. Every fetch goes through `ssrf_guard` first, and again on every redirect
hop (`follow_redirects=False` — redirects are handled manually here so a
malicious redirect target gets the same check the original URL did).

Deliberately conservative: a hard byte cap on the response body (streamed,
never buffered past that cap), a content-type allowlist, a per-request
timeout, and a small bounded number of redirect hops.
"""

from __future__ import annotations

import httpx

from app.services.ecommerce.ssrf_guard import UnsafeUrlError, validate_url_is_safe_to_fetch_and_pin

_HTML_CONTENT_TYPES = ("text/html", "application/xhtml+xml")
_IMAGE_CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")


class FetchError(Exception):
    """A URL could not be safely/successfully fetched — unsafe target,
    unreachable host, disallowed content-type, or over a size cap. Callers
    map this to a specific user-facing failure reason. `status_code` is set
    only when the origin server itself responded with a non-200 status
    (e.g. 429), so a caller can distinguish "the origin rate-limited us"
    from every other failure mode without parsing this exception's message."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        self.status_code = status_code
        super().__init__(message)


def _fetch_with_manual_redirects(
    url: str,
    *,
    max_bytes: int,
    allowed_content_types: tuple[str, ...],
    settings,
) -> tuple[bytes, str]:
    """One fetch, one pass — returns (body, content_type) together so a
    caller never needs a second request just to learn what the first one
    already told it."""
    current_url = url
    for _ in range(settings.ecommerce_max_redirects + 1):
        try:
            hostname, pinned_ip = validate_url_is_safe_to_fetch_and_pin(current_url)
        except UnsafeUrlError as exc:
            raise FetchError(str(exc)) from exc

        # P2 hardening (F-009): connect to the EXACT IP just validated,
        # never a second, independent DNS resolution (that gap is what let
        # a DNS-rebinding attack swap the target between check and
        # connect). `sni_hostname` keeps TLS certificate verification
        # against the real hostname; the `Host` header does the same for
        # the origin server's own virtual-hosting — the request is
        # otherwise identical to fetching `current_url` directly.
        pinned_url = httpx.URL(current_url).copy_with(host=pinned_ip)
        extensions = {"sni_hostname": hostname} if pinned_url.scheme == "https" else {}

        try:
            # A fresh Client per hop (matches the old httpx.stream()
            # shortcut's own per-call-connection shape) — `extensions` is
            # only exposed via the Client/Request API, not the module-
            # level httpx.stream() shortcut. `trust_env=False`: an
            # operator-configured HTTP_PROXY/HTTPS_PROXY/NO_PROXY env var
            # must never silently reroute a request this guard just
            # validated through a proxy that itself has access to
            # internal ranges.
            with httpx.Client(trust_env=False) as http_client, http_client.stream(
                "GET",
                pinned_url,
                follow_redirects=False,
                timeout=settings.ecommerce_fetch_timeout_seconds,
                headers={"User-Agent": "DigiPramaanEcommerceScanner/1.0", "Host": hostname},
                extensions=extensions,
            ) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise FetchError("Redirect response had no Location header")
                    current_url = str(httpx.URL(current_url).join(location))
                    continue

                if response.status_code != 200:
                    raise FetchError(
                        f"Unexpected status code: {response.status_code}",
                        status_code=response.status_code,
                    )

                content_type = response.headers.get("content-type", "").split(";")[0].strip()
                if content_type not in allowed_content_types:
                    raise FetchError(f"Disallowed content-type: {content_type or '(none)'}")

                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise FetchError(f"Response exceeded the {max_bytes}-byte cap")
                    chunks.append(chunk)
                return b"".join(chunks), content_type
        except httpx.HTTPError as exc:
            raise FetchError(f"Could not fetch {current_url}: {exc}") from exc

    raise FetchError("Too many redirects")


def fetch_listing_html(url: str, settings) -> str:
    """Fetches a listing (or category) page's HTML, safety-checked at the
    original URL and every redirect hop. Raises FetchError on any failure —
    unsafe target, unreachable, wrong content-type, or over the HTML size
    cap."""
    body, _content_type = _fetch_with_manual_redirects(
        url,
        max_bytes=settings.ecommerce_max_html_bytes,
        allowed_content_types=_HTML_CONTENT_TYPES,
        settings=settings,
    )
    return body.decode("utf-8", errors="replace")


def fetch_image_bytes(url: str, settings) -> tuple[bytes, str]:
    """Fetches one image discovered on a listing page — the SAME safety
    checks as the listing page itself apply here: an `og:image` pointing at
    a metadata endpoint is exactly as dangerous as the listing URL. Returns
    (bytes, content_type)."""
    return _fetch_with_manual_redirects(
        url,
        max_bytes=settings.ecommerce_max_image_bytes,
        allowed_content_types=_IMAGE_CONTENT_TYPES,
        settings=settings,
    )
