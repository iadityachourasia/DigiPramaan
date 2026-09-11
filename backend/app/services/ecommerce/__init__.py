"""
services/ecommerce/ — real fetch-and-parse pipeline for the E-commerce
Listing Scanner. SSRF-guarded, site-agnostic (JSON-LD/Open Graph/<img>
extraction, no per-marketplace scraper, no headless browser).
"""

from app.services.ecommerce.category import discover_candidate_urls, scrape_category
from app.services.ecommerce.fetcher import FetchError, fetch_image_bytes, fetch_listing_html
from app.services.ecommerce.parser import parse_listing_html
from app.services.ecommerce.ssrf_guard import UnsafeUrlError, validate_url_is_safe_to_fetch
from app.services.ecommerce.types import ParsedImage, ParsedListing

__all__ = [
    "FetchError",
    "ParsedImage",
    "ParsedListing",
    "UnsafeUrlError",
    "discover_candidate_urls",
    "fetch_image_bytes",
    "fetch_listing_html",
    "parse_listing_html",
    "scrape_category",
    "validate_url_is_safe_to_fetch",
]
