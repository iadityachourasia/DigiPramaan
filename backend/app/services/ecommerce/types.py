"""
services/ecommerce/types.py — result models for the listing fetch/parse
pipeline. Additive, standalone Pydantic models — nothing here touches any
existing scan/extraction schema; a `ParsedListing`'s images become ordinary
evidence images once handed to the shared scan-session-creation helper
(see api/v1/scans.py's `create_scan_session_from_images`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ParsedImage(BaseModel):
    """An absolute, resolved image URL found on the listing page — not yet
    fetched. `fetcher.py` fetches and safety-checks each one individually
    before it becomes evidence."""

    url: str
    alt: str | None = None


class ParsedListing(BaseModel):
    """One listing page's extracted content. `parse_method` records which
    tier actually produced this result, so a caller can tell "confidently
    parsed via schema.org markup" apart from "found nothing, this is an
    empty shell" — see parser.py's own docstring on the fallback order."""

    source_url: str
    title: str | None = None
    description: str | None = None
    images: list[ParsedImage] = []
    parse_method: Literal["json_ld", "opengraph", "img_fallback", "none"]
    warnings: list[str] = []
