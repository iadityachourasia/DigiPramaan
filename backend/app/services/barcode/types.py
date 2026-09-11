"""
services/barcode/types.py — result models for barcode detection/decoding.

Additive, standalone Pydantic models — nothing here changes any existing
extraction/rule schema. `ComplianceEvidenceBundle.barcode_analysis` (see
extraction/schema.py) is the one place a `BarcodeAnalysis` gets attached.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class BarcodeDecodeResult(BaseModel):
    """One successful decode — either a full-image pass or a cropped
    candidate region. `checksum_valid` is computed by this service's own
    deterministic `checksum.py`, never taken on faith from the decoder."""

    raw_value: str
    normalized_value: str  # GTIN-14, left-zero-padded — see normalize.py
    symbology: Literal["EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF"]
    checksum_valid: bool
    source_image_id: str
    source_angle: str
    bbox: tuple[float, float, float, float] | None = None  # natural-pixel [x0,y0,x1,y1]
    decoder: Literal["zxing_full_image", "zxing_crop"]
    detection_method: Literal["full_image", "cropped_candidate"]
    quality: float = 1.0


class BarcodeAnalysis(BaseModel):
    """The one resolved-once-per-scan result, computed deterministically by
    resolve.py across every image's BarcodeDecodeResults — never by Gemini.

    - "trusted": exactly one distinct checksum-valid value was found anywhere
      across the three images — `trusted_identifier` is set, safe for
      Product DNA identity resolution.
    - "needs_review": more than one distinct checksum-valid value was found —
      `trusted_identifier` stays None; an officer must look at `candidates`.
    - "none": no checksum-valid value found (candidates may still contain
      invalid-checksum evidence) — the normal, unremarkable result when a
      product has no visible/legible barcode. Existing Product DNA composite
      fallback is unaffected.
    """

    candidates: list[BarcodeDecodeResult] = []
    trusted_identifier: BarcodeDecodeResult | None = None
    status: Literal["trusted", "needs_review", "none"] = "none"


def _decode_result_to_frontend(result: BarcodeDecodeResult) -> dict:
    """This codebase's established convention (records/serialize.py,
    product_dna/dna.py, etc.) is a manually-built camelCase dict, never a
    pydantic alias generator — matched here rather than introducing a
    second frontend-serialization pattern for just this one model."""
    return {
        "rawValue": result.raw_value,
        "normalizedValue": result.normalized_value,
        "symbology": result.symbology,
        "checksumValid": result.checksum_valid,
        "sourceImageId": result.source_image_id,
        "sourceAngle": result.source_angle,
        "bbox": list(result.bbox) if result.bbox else None,
        "decoder": result.decoder,
        "detectionMethod": result.detection_method,
        "quality": result.quality,
    }


def barcode_analysis_to_frontend(analysis: BarcodeAnalysis) -> dict:
    return {
        "status": analysis.status,
        "trustedIdentifier": (
            _decode_result_to_frontend(analysis.trusted_identifier) if analysis.trusted_identifier else None
        ),
        "candidates": [_decode_result_to_frontend(c) for c in analysis.candidates],
    }
