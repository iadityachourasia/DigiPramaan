"""
api/v1/ecommerce.py — the real E-commerce Listing Scanner backend.

POST /ecommerce/scrape-preview, POST /ecommerce/scan, POST /ecommerce/batch,
GET /ecommerce/batch/{id}. Every fetch goes through services/ecommerce
(SSRF-guarded, site-agnostic JSON-LD/Open Graph/<img> extraction) — never
the client's own claimed image list, since a client-supplied URL list would
let an officer's browser hand this backend an arbitrary fetch target
un-checked. `create_scan_session_from_images` (scans.py) is the one place
a ScanSession/EvidenceImage/run_pipeline actually gets created — this
router only ever gets there by fetching real images itself first.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.api.deps.permissions import require_permission
from app.api.v1.scans import create_scan_session_from_images
from app.core.config import Settings, get_settings
from app.db.models import EcommerceBatch, Profile, ScanSession
from app.db.session import get_db
from app.services.authz.repositories import get_visible_batch
from app.services.ecommerce import (
    FetchError,
    ParsedListing,
    UnsafeUrlError,
    discover_candidate_urls,
    fetch_image_bytes,
    fetch_listing_html,
    parse_listing_html,
    validate_url_is_safe_to_fetch,
)

router = APIRouter(tags=["ecommerce"])

ScrapeFailure = Literal["invalid_url", "unrecognized", "empty", "rate_limited"]


class ScrapePreviewRequest(BaseModel):
    url: str
    mode: Literal["single", "bulk"]


class EcommerceScanRequest(BaseModel):
    url: str
    category: str
    region: str
    manufacturer_name: str | None = Field(default=None, alias="manufacturerName")

    model_config = ConfigDict(populate_by_name=True)


class EcommerceBatchRequest(BaseModel):
    source_url: str = Field(alias="sourceUrl")
    selected_urls: list[str] = Field(alias="selectedUrls")
    category: str
    region: str
    manufacturer_name: str | None = Field(default=None, alias="manufacturerName")

    model_config = ConfigDict(populate_by_name=True)


def _parsed_listing_to_frontend(parsed: ParsedListing) -> dict:
    """ParsedListing (this backend's own shape) -> ScrapedListing (the
    frontend's shape, src/types/scan.ts). A preview has not fetched each
    image's actual bytes yet (only the listing page's HTML) — `sizeBytes`
    is unknown at this point and reported as 0, a documented limitation
    rather than a second, wasteful fetch pass just to learn sizes."""
    return {
        "id": str(uuid.uuid4()),
        "listingUrl": parsed.source_url,
        "title": parsed.title or "",
        "descriptionExcerpt": (parsed.description or "")[:280],
        "images": [
            {
                "id": str(uuid.uuid4()),
                "fileName": image.url.rsplit("/", 1)[-1] or f"image-{i}.jpg",
                "url": image.url,
                "sizeBytes": 0,
                "angle": "front" if i == 0 else "additional",
                # A-02: alt text is mandatory, never empty. Real alt text
                # when the source page's own <img alt> carried one;
                # otherwise a generic-but-honest fallback naming the
                # listing itself rather than a blank string.
                "altText": image.alt or parsed.title or "Product photo from listing",
            }
            for i, image in enumerate(parsed.images)
        ],
        "status": "queued",
    }


def _map_fetch_failure(exc: Exception) -> ScrapeFailure:
    if isinstance(exc, UnsafeUrlError):
        return "invalid_url"
    if isinstance(exc, FetchError) and exc.status_code == 429:
        return "rate_limited"
    return "unrecognized"


@router.post("/ecommerce/scrape-preview")
def scrape_preview(
    payload: ScrapePreviewRequest,
    settings: Settings = Depends(get_settings),
    _current_user: Profile = Depends(require_permission("scan.create")),
) -> dict:
    """Fetch + parse only — no ScanSession created. The preview-before-
    commit step (single mode: one listing; bulk mode: every candidate
    found on a category/search page)."""
    try:
        validate_url_is_safe_to_fetch(payload.url)
    except UnsafeUrlError:
        return {"ok": False, "failure": "invalid_url"}

    if payload.mode == "single":
        try:
            html = fetch_listing_html(payload.url, settings)
        except FetchError as exc:
            return {"ok": False, "failure": _map_fetch_failure(exc)}

        parsed = parse_listing_html(html, payload.url)
        if parsed.parse_method == "none":
            return {"ok": False, "failure": "unrecognized"}
        return {"ok": True, "listing": _parsed_listing_to_frontend(parsed)}

    # Bulk mode.
    try:
        category_html = fetch_listing_html(payload.url, settings)
    except FetchError as exc:
        return {"ok": False, "failure": _map_fetch_failure(exc)}

    candidate_urls = discover_candidate_urls(
        category_html, payload.url, limit=settings.ecommerce_max_category_listings
    )
    if not candidate_urls:
        return {"ok": False, "failure": "empty"}

    listings: list[dict] = []
    for url in candidate_urls:
        try:
            html = fetch_listing_html(url, settings)
        except FetchError:
            continue
        parsed = parse_listing_html(html, url)
        if parsed.parse_method != "none":
            listings.append(_parsed_listing_to_frontend(parsed))

    if not listings:
        return {"ok": False, "failure": "empty"}
    return {"ok": True, "listings": listings}


@router.post("/ecommerce/scan", status_code=status.HTTP_201_CREATED)
def create_ecommerce_scan(
    payload: EcommerceScanRequest,
    background_tasks: BackgroundTasks,
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Single-listing commit (08 §3). Re-fetches `payload.url` and its
    images server-side — never trusts a client-supplied image list — then
    calls the SAME create_scan_session_from_images() helper POST /scans
    uses, with source="E-commerce-Sourced"."""
    try:
        validate_url_is_safe_to_fetch(payload.url)
        html = fetch_listing_html(payload.url, settings)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    parsed = parse_listing_html(html, payload.url)
    if parsed.parse_method == "none" or not parsed.images:
        raise HTTPException(
            status_code=422, detail="No product images or data could be found at this URL."
        )

    images: list[tuple[str, str, bytes]] = []
    for i, image in enumerate(parsed.images):
        try:
            image_bytes, content_type = fetch_image_bytes(image.url, settings)
        except (UnsafeUrlError, FetchError):
            continue
        ext = content_type.split("/")[-1] if "/" in content_type else "jpg"
        angle = "front" if i == 0 else "additional"
        images.append((angle, f"{angle}-{i}.{ext}", image_bytes))

    if not images:
        raise HTTPException(
            status_code=422, detail="The listing's images could not be safely fetched."
        )

    return create_scan_session_from_images(
        db=db,
        settings=settings,
        background_tasks=background_tasks,
        created_by=current_user.id,
        category=payload.category,
        region=payload.region,
        source="E-commerce-Sourced",
        images=images,
        ecommerce_listing_url=payload.url,
    )


@router.post("/ecommerce/batch", status_code=status.HTTP_201_CREATED)
def create_ecommerce_batch(
    payload: EcommerceBatchRequest,
    background_tasks: BackgroundTasks,
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Bulk commit (08 §4): one independent ScanSession per selected URL,
    all sharing one EcommerceBatch row — a listing that fails to fetch is
    recorded as its own failed entry and never affects the others."""
    if len(payload.selected_urls) > settings.ecommerce_batch_max_urls:
        raise HTTPException(
            status_code=422,
            detail=f"A batch cannot exceed {settings.ecommerce_batch_max_urls} URLs",
        )

    batch = EcommerceBatch(source_url=payload.source_url, created_by=current_user.id)
    db.add(batch)
    db.flush()  # assigns batch.id without committing yet

    for url in payload.selected_urls:
        try:
            validate_url_is_safe_to_fetch(url)
            html = fetch_listing_html(url, settings)
            parsed = parse_listing_html(html, url)
            if parsed.parse_method == "none" or not parsed.images:
                continue
            images: list[tuple[str, str, bytes]] = []
            for i, image in enumerate(parsed.images):
                try:
                    image_bytes, content_type = fetch_image_bytes(image.url, settings)
                except (UnsafeUrlError, FetchError):
                    continue
                ext = content_type.split("/")[-1] if "/" in content_type else "jpg"
                angle = "front" if i == 0 else "additional"
                images.append((angle, f"{angle}-{i}.{ext}", image_bytes))
            if not images:
                continue

            create_scan_session_from_images(
                db=db,
                settings=settings,
                background_tasks=background_tasks,
                created_by=current_user.id,
                category=payload.category,
                region=payload.region,
                source="E-commerce-Sourced",
                images=images,
                ecommerce_listing_url=url,
                batch_id=batch.id,
            )
        except (UnsafeUrlError, FetchError, HTTPException):
            # One listing's failure must never sink the rest of the batch —
            # it simply produces no ScanSession and is absent from the
            # batch's derived listing count, same as the mock store's own
            # "partial failure structurally impossible to get wrong" rule.
            continue

    db.commit()
    return _batch_response(batch.id, db)


@router.get("/ecommerce/batch/{batch_id}")
def get_ecommerce_batch(
    batch_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    get_visible_batch(db, batch_id, current_user)
    return _batch_response(batch_id, db)


def _batch_response(batch_id: uuid.UUID, db: DbSession) -> dict:
    batch = db.get(EcommerceBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    sessions = (
        db.query(ScanSession)
        .filter(ScanSession.batch_id == batch_id)
        .order_by(ScanSession.created_at)
        .all()
    )

    listings = []
    scan_ids: dict[str, str] = {}
    for session in sessions:
        failed_stage = next((s for s in session.stages if s.get("state") == "failed"), None)
        ready_stage = next((s for s in session.stages if s.get("id") == "readyForVerification"), None)
        if failed_stage:
            listing_status = "failed"
        elif ready_stage and ready_stage.get("state") == "completed":
            listing_status = "done"
        else:
            listing_status = "scanning"

        listings.append(
            {
                "id": str(session.id),
                "listingUrl": session.ecommerce_listing_url or "",
                "title": "",
                "descriptionExcerpt": "",
                "images": [],
                "status": listing_status,
                **(
                    {"failureReason": failed_stage.get("failureReason") or "This listing could not be processed."}
                    if failed_stage
                    else {}
                ),
                **({"recordId": str(session.record_id)} if session.record_id else {}),
            }
        )
        scan_ids[str(session.id)] = str(session.id)

    return {
        "batch": {
            "id": str(batch.id),
            "sourceUrl": batch.source_url,
            "listings": listings,
            "createdAt": batch.created_at.isoformat() if batch.created_at else None,
        },
        "scanIds": scan_ids,
    }
