"""
services/ecommerce/category.py — bulk mode's candidate-link discovery.

Explicitly best-effort, not a guaranteed-complete crawl: a category/search
page's own HTML is scanned for links that look like distinct product-detail
pages (same-domain, a different path than the source page, deduplicated),
capped at `settings.ecommerce_max_category_listings` and fetched
sequentially through the exact same fetch/parse/SSRF path single-mode
uses — bulk mode shares 100% of that logic, only "how do we find the URLs"
differs.
"""

from __future__ import annotations

from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.services.ecommerce.fetcher import FetchError, fetch_listing_html
from app.services.ecommerce.parser import parse_listing_html
from app.services.ecommerce.types import ParsedListing


# P2 hardening (2026-09-19, F-009): a small, bounded, reviewable set of
# common multi-label public suffixes actually relevant to an India-
# focused Legal Metrology tool — not a full public-suffix-list. A plain
# last-two-labels comparison (the old behavior) incorrectly treats
# "shop.example.co.uk" and "evil.co.uk" as the same site. Deliberately
# NOT a `tldextract`/`publicsuffix2` dependency: this function only gates
# candidate-URL DISCOVERY on a category page (a dedup/filter heuristic,
# not a security boundary — the actual fetch stays IP-blocklist-gated via
# ssrf_guard regardless of domain matching), and a PSL dependency needs
# its own periodically-updated remote data file to stay accurate, which
# fits this project's "everything in-process/Postgres, no external
# freshness dependency" discipline worse than a small embedded list does.
_KNOWN_MULTI_LABEL_SUFFIXES = frozenset(
    {
        "co.in", "com.in", "org.in", "net.in", "gov.in", "ac.in", "edu.in", "res.in", "gen.in",
        "co.uk", "org.uk", "net.uk", "gov.uk", "ac.uk",
        "com.au", "net.au", "org.au", "gov.au",
        "co.nz", "org.nz", "net.nz",
        "co.za", "org.za",
        "co.jp", "or.jp", "ne.jp",
        "com.br", "net.br",
        "com.sg", "com.hk", "com.my", "com.cn",
    }
)


def _registrable_domain(hostname: str) -> str:
    labels = hostname.split(".")
    if len(labels) >= 3 and ".".join(labels[-2:]) in _KNOWN_MULTI_LABEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def _same_registrable_domain(a: str, b: str) -> bool:
    host_a = urlparse(a).hostname or ""
    host_b = urlparse(b).hostname or ""
    return bool(host_a) and _registrable_domain(host_a) == _registrable_domain(host_b)


def discover_candidate_urls(category_html: str, source_url: str, *, limit: int) -> list[str]:
    """Site-agnostic: any same-domain link whose path differs from the
    source page's own path, deduplicated, capped at `limit`. No attempt to
    classify which links are "really" product pages beyond that — each
    candidate is only confirmed by actually fetching and parsing it."""
    soup = BeautifulSoup(category_html, "html.parser")
    source_path = urlparse(source_url).path

    seen: set[str] = set()
    candidates: list[str] = []
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if href.startswith("#") or href.startswith("javascript:"):
            continue
        absolute = urljoin(source_url, href)
        if absolute in seen:
            continue
        if not _same_registrable_domain(absolute, source_url):
            continue
        if urlparse(absolute).path == source_path:
            continue
        seen.add(absolute)
        candidates.append(absolute)
        if len(candidates) >= limit:
            break
    return candidates


def scrape_category(source_url: str, settings) -> list[ParsedListing]:
    """Fetches the category/search page, discovers candidate product
    links, then fetches+parses each one through the same pipeline single-
    listing mode uses. A candidate that fails to fetch is silently
    skipped — one bad link on a category page must not sink the whole
    batch preview."""
    category_html = fetch_listing_html(source_url, settings)
    candidate_urls = discover_candidate_urls(
        category_html, source_url, limit=settings.ecommerce_max_category_listings
    )

    listings: list[ParsedListing] = []
    for url in candidate_urls:
        try:
            html = fetch_listing_html(url, settings)
        except FetchError:
            continue
        listings.append(parse_listing_html(html, url))
    return listings
