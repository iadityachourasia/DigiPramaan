"""
measurement/font_height.py — Phase 6's I/O-permitted font-height measurement
service. Deliberately separate from rules/checks.py: that module is pure by
design (no DB, no network, no I/O — see its own docstring), and computing a
real measurement needs to fetch an image from B2 and run OpenCV on it. This
service does that I/O and hands `check_rule_7_font_size()` a pre-computed,
already-decided `FontMeasurementResult` — the rule check itself stays pure,
only comparing numbers.

GEOMETRY, HONESTLY SCOPED
--------------------------
Two-point calibration (one known physical dimension + the two image points
that span it) establishes SCALE ONLY. It is not, and cannot be, perspective
correction — that needs at least 4 point correspondences to fit a homography,
which this MVP does not collect. The "plausible pixels-per-mm range" check
below is an honest bounds sanity-check on the resulting scale, not a claim
that tilt/perspective has been detected or corrected. Officer-facing copy
(frontend) asks for an approximately front-facing capture; nothing here
verifies that beyond this weak proxy.

THE OCR BBOX ONLY LOCATES THE CROP
------------------------------------
`EvidenceRef.bbox` (the OCR line's bounding box) is never itself treated as
the character height — it is a whole text line, which typically includes
ascenders/descenders/currency symbols/spacing well beyond a single numeral's
height. The crop it defines is then thresholded and decomposed into
connected components; the character-height estimate comes from those
components' own pixel extents, not the crop's overall height.
"""

from __future__ import annotations

import statistics
from typing import Literal

import numpy as np
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.object_storage import get_s3_client
from app.db.models import EvidenceImage
from app.services.extraction.schema import CalibrationData, EvidenceRef

# A calibration line shorter than this is too imprecise to scale a ~4mm
# character reliably (a 1px click error would already be a >2.5% error).
MIN_CALIBRATION_PIXEL_LENGTH = 40.0

# Honest bounds sanity-check only — see module docstring. A typical officer
# phone-camera package photo falls somewhere in this px/mm range; outside it,
# something about the calibration geometry (distance, angle, mis-click) is
# implausible enough that the resulting scale shouldn't be trusted.
PLAUSIBLE_PIXELS_PER_MM_RANGE = (2.0, 50.0)

# Below this, a "measured" result still isn't reliable enough to compare
# against a legal threshold — checks.py maps this to NEEDS_REVIEW.
MIN_MEASUREMENT_CONFIDENCE = 0.6

# Connected components smaller than this fraction of the crop's own area are
# treated as noise/dust rather than a character stroke.
_MIN_COMPONENT_AREA_FRACTION = 0.002
_CROP_PADDING_PX = 4

FontMeasurementStatus = Literal[
    "measured", "insufficient_evidence", "insufficient_calibration", "unreliable_geometry"
]


class FontMeasurementResult(BaseModel):
    status: FontMeasurementStatus
    measured_height_mm: float | None = None
    confidence: float = 0.0
    evidence: dict


def _is_degenerate_bbox(bbox: tuple[float, float, float, float] | None) -> bool:
    """The Gemini OCR-fallback path (ocr/gemini.py) honestly stamps every
    block's bbox as the whole-image placeholder (0, 0, 1, 1) when it has no
    real per-line geometry — cropping "the whole image" as if it were one
    declaration's region would fabricate precision that isn't there."""
    if bbox is None:
        return True
    x0, y0, x1, y1 = bbox
    return (x0, y0, x1, y1) == (0.0, 0.0, 1.0, 1.0)


def _fetch_image_bytes(image_id: str, db: Session, settings) -> bytes | None:
    import uuid

    try:
        image_uuid = uuid.UUID(image_id)
    except ValueError:
        return None
    image = db.get(EvidenceImage, image_uuid)
    if image is None:
        return None
    client = get_s3_client(settings)
    obj = client.get_object(Bucket=settings.s3_bucket, Key=image.storage_key)
    return obj["Body"].read()


def _crop_and_measure(image_bytes: bytes, bbox: tuple[float, float, float, float]) -> tuple[float, list[float]] | None:
    """Returns (median_component_height_px, all_qualifying_heights_px), or
    None if nothing measurable survives filtering."""
    import cv2

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]

    x0, y0, x1, y1 = bbox
    x0 = max(0, int(x0) - _CROP_PADDING_PX)
    y0 = max(0, int(y0) - _CROP_PADDING_PX)
    x1 = min(width, int(x1) + _CROP_PADDING_PX)
    y1 = min(height, int(y1) + _CROP_PADDING_PX)
    if x1 <= x0 or y1 <= y0:
        return None

    crop = image[y0:y1, x0:x1]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    num_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    crop_h, crop_w = binary.shape[:2]
    crop_area = crop_h * crop_w
    min_area = crop_area * _MIN_COMPONENT_AREA_FRACTION

    heights: list[float] = []
    for label in range(1, num_labels):  # label 0 is the background
        left, top, w, h, area = stats[label]
        if area < min_area:
            continue
        # A component touching the crop border is likely a neighboring
        # character/word cut off by the crop, not a whole stroke this crop
        # actually contains — excluded rather than counted as a full-height sample.
        if left <= 0 or top <= 0 or (left + w) >= crop_w or (top + h) >= crop_h:
            continue
        heights.append(float(h))

    if not heights:
        return None
    return statistics.median(heights), heights


def measure_font_height(
    calibration: CalibrationData, evidence_ref: EvidenceRef, db: Session, settings
) -> FontMeasurementResult:
    base_evidence = {
        "image_id": calibration.image_id,
        "field_id": calibration.field_id,
        "calibration_method": calibration.method,
        "known_dimension_mm": calibration.known_dimension_mm,
        "pixel_length": calibration.pixel_length,
    }

    if _is_degenerate_bbox(evidence_ref.bbox):
        return FontMeasurementResult(
            status="insufficient_evidence",
            evidence={**base_evidence, "reason": "no real per-line OCR bounding box for this field"},
        )

    if calibration.pixel_length < MIN_CALIBRATION_PIXEL_LENGTH:
        return FontMeasurementResult(
            status="insufficient_calibration",
            evidence={**base_evidence, "reason": f"calibration line under {MIN_CALIBRATION_PIXEL_LENGTH:.0f}px"},
        )

    pixels_per_mm = calibration.pixels_per_mm
    low, high = PLAUSIBLE_PIXELS_PER_MM_RANGE
    if not (low <= pixels_per_mm <= high):
        return FontMeasurementResult(
            status="unreliable_geometry",
            evidence={
                **base_evidence, "pixels_per_mm": pixels_per_mm,
                "reason": f"pixels_per_mm {pixels_per_mm:.2f} outside plausible range [{low}, {high}]",
            },
        )

    image_bytes = _fetch_image_bytes(evidence_ref.image_id, db, settings)
    if image_bytes is None:
        return FontMeasurementResult(
            status="insufficient_evidence",
            evidence={**base_evidence, "pixels_per_mm": pixels_per_mm, "reason": "source image not retrievable"},
        )

    measured = _crop_and_measure(image_bytes, evidence_ref.bbox)
    if measured is None:
        return FontMeasurementResult(
            status="insufficient_evidence",
            evidence={
                **base_evidence, "pixels_per_mm": pixels_per_mm,
                "bbox": list(evidence_ref.bbox), "reason": "no usable connected components in the cropped region",
            },
        )

    median_height_px, heights = measured
    mean_height = statistics.fmean(heights)
    stdev_height = statistics.pstdev(heights) if len(heights) > 1 else 0.0
    coefficient_of_variation = (stdev_height / mean_height) if mean_height > 0 else 1.0
    consistency = max(0.0, 1.0 - min(coefficient_of_variation, 1.0))
    confidence = consistency * min(1.0, len(heights) / 3.0)

    measured_height_mm = median_height_px / pixels_per_mm

    return FontMeasurementResult(
        status="measured",
        measured_height_mm=measured_height_mm,
        confidence=confidence,
        evidence={
            **base_evidence,
            "pixels_per_mm": pixels_per_mm,
            "bbox": list(evidence_ref.bbox),
            "component_heights_px": heights,
            "measured_character_height_px": median_height_px,
            "measured_height_mm": measured_height_mm,
            "confidence": confidence,
        },
    )
