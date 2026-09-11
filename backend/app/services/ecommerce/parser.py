"""
services/ecommerce/parser.py — turns fetched listing HTML into a
ParsedListing. Deliberately generic and site-agnostic: no per-marketplace
scraper, no JS execution, no headless browser. Tiered extraction, each tier
a fallback for the one before it:

  1. JSON-LD `Product` (schema.org) — the most structured, most reliable
     signal a page can carry, when present.
  2. Open Graph meta tags — a very common baseline even on pages with no
     schema.org markup.
  3. Plain `<img>` tags — a last resort, no title/description guarantee.

Known limitation, stated here rather than hidden: this works best on pages
that render their product markup server-side. A JS-only single-page-app
storefront that only hydrates content client-side will return partial data
or `parse_method="none"` — no headless browser is used, by design (see
this project's own policy against defeating bot-detection/anti-scraping
measures, and the real infra cost a browser-automation dependency would
add for a hackathon-scale MVP).
"""

from __future__ import annotations

import json
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.services.ecommerce.types import ParsedImage, ParsedListing

_MAX_IMAGES = 6


def _extract_json_ld_product(soup: BeautifulSoup, source_url: str) -> ParsedListing | None:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        candidates = data if isinstance(data, list) else [data]
        # A `@graph`-wrapped document nests its actual entries one level
        # deeper — flatten that one level in, never deeper (a JSON-LD
        # Product is not itself a container of further @graph blocks).
        flattened: list[dict] = []
        for entry in candidates:
            if not isinstance(entry, dict):
                continue
            if "@graph" in entry and isinstance(entry["@graph"], list):
                flattened.extend(e for e in entry["@graph"] if isinstance(e, dict))
            else:
                flattened.append(entry)

        for entry in flattened:
            if entry.get("@type") != "Product":
                continue

            raw_images = entry.get("image")
            image_urls: list[str] = []
            if isinstance(raw_images, str):
                image_urls = [raw_images]
            elif isinstance(raw_images, list):
                for item in raw_images:
                    if isinstance(item, str):
                        image_urls.append(item)
                    elif isinstance(item, dict) and isinstance(item.get("url"), str):
                        image_urls.append(item["url"])
            elif isinstance(raw_images, dict) and isinstance(raw_images.get("url"), str):
                image_urls = [raw_images["url"]]

            images = [
                ParsedImage(url=urljoin(source_url, url))
                for url in image_urls[:_MAX_IMAGES]
            ]
            return ParsedListing(
                source_url=source_url,
                title=entry.get("name"),
                description=entry.get("description"),
                images=images,
                parse_method="json_ld",
            )
    return None


def _extract_open_graph(soup: BeautifulSoup, source_url: str) -> ParsedListing | None:
    def meta_content(*properties: str) -> str | None:
        for prop in properties:
            tag = soup.find("meta", attrs={"property": prop})
            if tag and tag.get("content"):
                return tag["content"]
        return None

    og_title = meta_content("og:title")
    description = meta_content("og:description")
    image_tags = soup.find_all("meta", attrs={"property": ["og:image", "og:image:secure_url"]})
    image_urls = [tag["content"] for tag in image_tags if tag.get("content")]

    # Require an actual OG signal (og:title or an og:image) before claiming
    # this tier — falling back to the page's plain <title> tag here would
    # make nearly every page "succeed" at this tier (almost all pages have
    # a <title>), permanently starving the <img> fallback tier below it.
    if not og_title and not image_urls:
        return None

    title = og_title or (soup.title.string if soup.title else None)
    images = [ParsedImage(url=urljoin(source_url, url)) for url in image_urls[:_MAX_IMAGES]]
    return ParsedListing(
        source_url=source_url,
        title=title,
        description=description,
        images=images,
        parse_method="opengraph",
    )


def _extract_img_fallback(soup: BeautifulSoup, source_url: str) -> ParsedListing:
    warnings = ["No Open Graph or schema.org Product markup found — using <img> tags only."]
    image_urls: list[str] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src or src.startswith("data:") or src.lower().endswith(".svg"):
            continue
        image_urls.append(src)
        if len(image_urls) >= _MAX_IMAGES:
            break

    title = soup.title.string if soup.title else None
    images = [ParsedImage(url=urljoin(source_url, url)) for url in image_urls]
    return ParsedListing(
        source_url=source_url,
        title=title,
        images=images,
        parse_method="img_fallback" if images else "none",
        warnings=warnings if images else warnings + ["No usable images found on the page."],
    )


def parse_listing_html(html: str, source_url: str) -> ParsedListing:
    """Runs the tiered extraction above, in order, returning the first
    tier that produces a usable result."""
    soup = BeautifulSoup(html, "html.parser")

    result = _extract_json_ld_product(soup, source_url)
    if result is not None:
        return result

    result = _extract_open_graph(soup, source_url)
    if result is not None:
        return result

    return _extract_img_fallback(soup, source_url)
