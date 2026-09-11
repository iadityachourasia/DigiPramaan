"""
services/barcode/detect.py — the one I/O-permitted module in this package.

Mirrors `services/measurement/font_height.py`'s split: this module does real
work (fetches image bytes, runs OpenCV/zxing-cpp), `resolve.py` stays pure.

Per image, in this fixed order (never relying on only one method — §A):

  1. Full-image decode via zxing-cpp.
  2. OpenCV `cv2.barcode.BarcodeDetector` region detection on the full image
     (detection only — zxing-cpp remains the actual decoder, per the
     project's own dependency-safety review: OpenCV is already a
     transitive dependency via paddleocr, zxing-cpp is a self-contained
     wheel, and neither needs pyzbar's libzbar0 system library).
  3. Each detected candidate is cropped with generous padding (50% of the
     candidate's own width/height on each side — verified empirically
     during implementation: a naive ~15% padding reliably produced crops
     zxing-cpp could NOT decode even on a clean generated barcode, because
     OpenCV's detected quad tracks the bar region tightly and clips the
     quiet zone a decoder needs; 50% consistently worked in that same
     round-trip test) and decoded through this project's progressive
     preprocessing chain (§C — original crop first, only escalating if it
     fails): raw -> grayscale -> grayscale+CLAHE contrast -> +2x upscale
     (only if the crop's shorter side is under 200px) -> +light unsharp
     mask. Stops at the first variant that decodes.

QR is never decoded here (`_DECODE_FORMATS` excludes it) — this pipeline
never treats arbitrary QR content as a product GTIN (§D).
"""

from __future__ import annotations

import io

import cv2
import numpy as np
import structlog
import zxingcpp
from PIL import Image

from app.services.barcode.checksum import validate_checksum
from app.services.barcode.normalize import normalize_gtin
from app.services.barcode.types import BarcodeDecodeResult

logger = structlog.get_logger(__name__)

# Only the symbologies this pipeline treats as product identifiers (§D) —
# excludes QR/DataMatrix/Code128/Code39/etc. even though zxing-cpp can read
# those too.
_DECODE_FORMATS = (
    zxingcpp.EAN13 | zxingcpp.EAN8 | zxingcpp.UPCA | zxingcpp.UPCE | zxingcpp.ITF
)

_SYMBOLOGY_BY_FORMAT_NAME = {
    "EAN13": "EAN_13",
    "EAN8": "EAN_8",
    "UPCA": "UPC_A",
    "UPCE": "UPC_E",
    "ITF": "ITF",
}

_CROP_PADDING_FRACTION = 0.5
_UPSCALE_MIN_SIDE_PX = 200


def _load_grayscale(image_bytes: bytes) -> np.ndarray:
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2GRAY)


def _to_results(
    barcodes: list, image_id: str, angle: str, decoder: str,
    detection_method: str, bbox: tuple[float, float, float, float] | None,
) -> list[BarcodeDecodeResult]:
    results: list[BarcodeDecodeResult] = []
    for barcode in barcodes:
        symbology = _SYMBOLOGY_BY_FORMAT_NAME.get(barcode.format.name)
        if symbology is None or not barcode.text.isdigit():
            continue  # not one of the 5 product-identifier symbologies this pipeline trusts
        normalized = normalize_gtin(barcode.text, symbology)
        if normalized is None:
            continue  # decoder returned an unexpected length for its own reported symbology
        results.append(
            BarcodeDecodeResult(
                raw_value=barcode.text,
                normalized_value=normalized,
                symbology=symbology,
                checksum_valid=validate_checksum(barcode.text, symbology),
                source_image_id=image_id,
                source_angle=angle,
                bbox=bbox,
                decoder=decoder,
                detection_method=detection_method,
                quality=1.0,
            )
        )
    return results


def _bbox_from_position(position, offset_x: float = 0.0, offset_y: float = 0.0) -> tuple[float, float, float, float]:
    xs = [position.top_left.x, position.top_right.x, position.bottom_right.x, position.bottom_left.x]
    ys = [position.top_left.y, position.top_right.y, position.bottom_right.y, position.bottom_left.y]
    return (min(xs) + offset_x, min(ys) + offset_y, max(xs) + offset_x, max(ys) + offset_y)


def _decode_crop_progressively(crop: np.ndarray) -> list:
    """Tries the crop as-is, then progressively-processed variants (§C —
    conservative by default, never jumping straight to aggressive
    thresholding), stopping at the first variant that decodes anything."""
    variants = [crop]

    gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    variants.append(gray)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast_normalized = clahe.apply(gray)
    variants.append(contrast_normalized)

    if min(gray.shape[:2]) < _UPSCALE_MIN_SIDE_PX:
        upscaled = cv2.resize(contrast_normalized, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        variants.append(upscaled)
        sharpen_base = upscaled
    else:
        sharpen_base = contrast_normalized

    blurred = cv2.GaussianBlur(sharpen_base, (0, 0), sigmaX=1.0)
    sharpened = cv2.addWeighted(sharpen_base, 1.5, blurred, -0.5, 0)
    variants.append(sharpened)

    for variant in variants:
        found = zxingcpp.read_barcodes(variant, formats=_DECODE_FORMATS)
        if found:
            return found
    return []


def detect_barcodes(image_bytes: bytes, image_id: str, angle: str) -> list[BarcodeDecodeResult]:
    """One image's full detection+decode pass. Never raises for "nothing
    found" (returns an empty list) — only a genuine I/O/library error
    propagates, which the caller (jobs/pipeline.py) catches and turns into a
    non-blocking `failed` stage state, per §F/§O ("no barcode" is a normal
    result; a decode failure must never block the rest of the pipeline)."""
    results: list[BarcodeDecodeResult] = []
    gray = _load_grayscale(image_bytes)

    full_image_hits = zxingcpp.read_barcodes(gray, formats=_DECODE_FORMATS)
    for hit in full_image_hits:
        bbox = _bbox_from_position(hit.position) if hit.position else None
        results.extend(_to_results([hit], image_id, angle, "zxing_full_image", "full_image", bbox))

    try:
        detector = cv2.barcode.BarcodeDetector()
        found, points = detector.detect(gray)
    except Exception:  # noqa: BLE001 - detection is a best-effort second pass
        found, points = False, None

    if found and points is not None:
        for quad in points:
            xs = quad[:, 0]
            ys = quad[:, 1]
            x0, x1 = float(xs.min()), float(xs.max())
            y0, y1 = float(ys.min()), float(ys.max())
            pad_x = (x1 - x0) * _CROP_PADDING_FRACTION
            pad_y = (y1 - y0) * _CROP_PADDING_FRACTION
            cx0 = max(0, int(x0 - pad_x))
            cy0 = max(0, int(y0 - pad_y))
            cx1 = min(gray.shape[1], int(x1 + pad_x))
            cy1 = min(gray.shape[0], int(y1 + pad_y))
            if cx1 <= cx0 or cy1 <= cy0:
                continue

            crop = gray[cy0:cy1, cx0:cx1]
            crop_hits = _decode_crop_progressively(crop)
            for hit in crop_hits:
                # The crop's own decoded position is relative to the crop —
                # offset back into full-image natural-pixel coordinates so
                # the evidence bbox lines up with the ImageViewer's existing
                # highlight math (same space EvidenceRef.bbox already uses).
                bbox = _bbox_from_position(hit.position, offset_x=cx0, offset_y=cy0) if hit.position else (
                    float(cx0), float(cy0), float(cx1), float(cy1)
                )
                results.extend(
                    _to_results([hit], image_id, angle, "zxing_crop", "cropped_candidate", bbox)
                )

    return results
