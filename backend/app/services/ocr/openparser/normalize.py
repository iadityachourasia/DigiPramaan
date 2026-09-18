"""
services/ocr/openparser/normalize.py — OP-Phase 4's versioned adapter:
`ParsedDocumentStrict` -> `OcrElement`, plus a legacy-compatibility step
down to the existing `OcrBlock` shape (`app/services/ocr/provider.py`,
UNCHANGED by this phase).

Not wired into `jobs/pipeline.py`/`rules/checks.py` this phase (Phase 5
wires orchestration, Phase 6 wires grounding/adaptive quality) — nothing
here is imported by the running application yet.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.services.ocr.openparser.confidence import OcrConfidence, map_confidence
from app.services.ocr.openparser.geometry import TransformManifest, map_bbox_to_original_pixels
from app.services.ocr.openparser.normalized_schemas import DocumentPage, Element, ParsedDocumentStrict
from app.services.ocr.provider import OcrBlock

NORMALIZATION_ADAPTER_VERSION = "openparser-normalize-v1"


class OcrElement(BaseModel):
    """The canonical internal per-detection shape for a normalized
    OpenParser result (spec §12.2). Never collapses provider elements —
    one `OcrElement` per `(element, location)` pair, so a table or other
    semantic element with multiple locations keeps each as its own entry
    rather than losing the source element to an ambiguous merge."""

    element_id: str  # stable local ID (deterministic, derived below)
    provider_element_id: str
    image_id: str
    angle: str
    page_number: int
    text: str
    element_type: str  # from Element.kind (+ .role when present)
    confidence: OcrConfidence | None
    bbox_source: tuple[float, float, float, float] | None  # as reported, in `coordinate_unit`
    coordinate_unit: str
    page_width: float
    page_height: float
    bbox_original_px: tuple[float, float, float, float] | None  # None unless provably mapped
    provider: str
    model: str
    output_format: str
    profile_version: str
    provider_job_id: str | None
    attempt_id: str
    input_sha256: str
    canonical_result_sha256: str
    reading_order_index: int | None = None
    related_element_ids: list[str] = []
    adapter_version: str = NORMALIZATION_ADAPTER_VERSION


def _element_type(element: Element) -> str:
    return f"{element.kind}:{element.role}" if element.role else element.kind


def _reading_order_index(page: DocumentPage | None, element_id: str) -> int | None:
    order = getattr(page, "reading_order", None) if page is not None else None
    if not order:
        return None
    try:
        return list(order).index(element_id)
    except ValueError:
        return None


def _local_element_id(job_id: str, provider_element_id: str, location_index: int) -> str:
    """Deterministic (uuid5), so re-normalizing the identical input always
    produces the identical local element ID — never a random one that
    would make two normalization runs of the same artifact look like
    different data."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ocr-element:{job_id}:{provider_element_id}:{location_index}"))


def normalize_parsed_document(
    parsed: ParsedDocumentStrict,
    *,
    job,  # app.db.models.ocr_provider_job.OcrProviderJob — typed loosely to avoid a hard DB import here
    transform: TransformManifest | None = None,
    dpi: float | None = None,
) -> list[OcrElement]:
    """One `OcrElement` per provider element per location. Confidence is
    never invented when absent; `bbox_original_px` is `None` immediately
    (no coordinate math attempted) when the job row lacks
    `input_width_px`/`input_height_px` — an unset original-image size
    means "provably mapped" can never be true."""
    pages_by_number = {page.number: page for page in parsed.pages}
    elements: list[OcrElement] = []

    can_map_pixels = bool(job.input_width_px) and bool(job.input_height_px)

    for element in parsed.elements:
        confidence = map_confidence(element.confidence)
        for location_index, location in enumerate(element.locations):
            page = pages_by_number.get(location.page_number)
            bbox_original_px = None
            coordinate_unit = page.unit if page is not None else "pixel"
            page_width = page.width if page is not None else 0.0
            page_height = page.height if page is not None else 0.0

            if page is not None and location.bbox is not None and can_map_pixels:
                bbox_original_px = map_bbox_to_original_pixels(
                    bbox=location.bbox,
                    unit=page.unit,
                    page=page,
                    original_width_px=job.input_width_px,
                    original_height_px=job.input_height_px,
                    transform=transform,
                    dpi=dpi,
                )

            elements.append(
                OcrElement(
                    element_id=_local_element_id(str(job.id), element.id, location_index),
                    provider_element_id=element.id,
                    image_id=str(job.evidence_image_id),
                    angle=job.angle,
                    page_number=location.page_number,
                    text=element.text or "",
                    element_type=_element_type(element),
                    confidence=confidence,
                    bbox_source=(
                        (location.bbox.left, location.bbox.top, location.bbox.right, location.bbox.bottom)
                        if location.bbox is not None
                        else None
                    ),
                    coordinate_unit=coordinate_unit,
                    page_width=page_width,
                    page_height=page_height,
                    bbox_original_px=bbox_original_px,
                    provider=job.provider,
                    model=job.model_id,
                    output_format=job.output_format,
                    profile_version=job.profile_version,
                    provider_job_id=job.provider_job_id,
                    attempt_id=str(job.id),
                    input_sha256=job.input_sha256,
                    canonical_result_sha256=job.canonical_result_sha256 or "",
                    reading_order_index=_reading_order_index(page, element.id),
                )
            )

    return elements


def to_legacy_ocr_block(element: OcrElement) -> OcrBlock | None:
    """Returns `None` (skip) rather than fabricating anything, whenever
    the legacy `OcrBlock` shape cannot be honestly populated:
    - `element.confidence is None` — `OcrBlock.confidence` is a required
      float; there is no honest value to put there.
    - `element.bbox_original_px is None` — `OcrBlock.bbox` is documented
      as always original-image-pixel-space; an unverified or non-pixel
      bbox must never leak through this shape (Rule 7 measurement and
      evidence crops both trust it unconditionally).

    Confidence scope is NOT checked here beyond non-None — a caller that
    wants only recognition-scope confidence should filter with
    `confidence.is_recognition_confidence` before calling this, since
    "legacy-compatible" and "recognition-scope-only" are different
    decisions a caller might want independently."""
    if element.confidence is None or element.bbox_original_px is None:
        return None
    return OcrBlock(
        image_id=element.image_id,
        text=element.text,
        confidence=element.confidence.score * 100.0,  # OcrBlock's 0-100 scale
        bbox=element.bbox_original_px,
        provider=element.provider,
    )
