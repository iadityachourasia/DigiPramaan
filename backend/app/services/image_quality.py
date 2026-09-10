"""
image_quality.py — real, lightweight pre-OCR checks.

Reuses `opencv-contrib-python`, already a transitive dependency of
PaddleOCR — no second CV library added just for this. Every check is cheap
enough to run synchronously inside the POST /scans request itself (the
established "quality gate must give a verdict before the officer leaves the
capture screen" rule), not as an async pipeline stage.

Deliberately NOT attempted here: curvature, perspective/skew, glare — all
explicitly out of MVP scope. Duplicate detection is exact-hash only (see
`find_duplicate_angles`), compared across the 3 images in one scan
submission — not perceptual/near-duplicate matching.
"""

from __future__ import annotations

import hashlib
from enum import StrEnum
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
from pydantic import BaseModel

MIN_WIDTH = 400
MIN_HEIGHT = 400

# Laplacian variance — lower means blurrier. Thresholds are a starting,
# documented heuristic (same "simple, honest heuristic, not a model"
# discipline as the existing repeat-violation threshold elsewhere in this
# codebase), not a tuned model.
BLUR_RECAPTURE_THRESHOLD = 50.0
BLUR_REVIEW_THRESHOLD = 120.0

# Mean pixel brightness, 0-255.
DARK_RECAPTURE_THRESHOLD = 40.0
DARK_REVIEW_THRESHOLD = 70.0

# Fraction of near-white (>250) pixels — overexposure is REVIEW-only, never
# a hard block, per the MVP scope decision.
OVEREXPOSURE_REVIEW_FRACTION = 0.35


class QualityVerdict(StrEnum):
    PASS = "PASS"
    RECAPTURE_REQUIRED = "RECAPTURE_REQUIRED"
    REVIEW = "REVIEW"


class QualityCheck(BaseModel):
    name: str
    passed: bool
    score: float
    threshold: float
    verdict: QualityVerdict


class QualityResult(BaseModel):
    checks: list[QualityCheck]
    overall_verdict: QualityVerdict
    reason: str | None = None
    width: int
    height: int
    content_hash: str


def _verdict_from_checks(checks: list[QualityCheck]) -> QualityVerdict:
    if any(c.verdict == QualityVerdict.RECAPTURE_REQUIRED for c in checks):
        return QualityVerdict.RECAPTURE_REQUIRED
    if any(c.verdict == QualityVerdict.REVIEW for c in checks):
        return QualityVerdict.REVIEW
    return QualityVerdict.PASS


def evaluate_image_quality(image_bytes: bytes) -> QualityResult:
    content_hash = hashlib.sha256(image_bytes).hexdigest()

    try:
        pil_image = Image.open(BytesIO(image_bytes))
        pil_image.verify()
        pil_image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 - any decode failure is a real quality failure
        return QualityResult(
            checks=[
                QualityCheck(
                    name="decodable",
                    passed=False,
                    score=0.0,
                    threshold=1.0,
                    verdict=QualityVerdict.RECAPTURE_REQUIRED,
                )
            ],
            overall_verdict=QualityVerdict.RECAPTURE_REQUIRED,
            reason=f"Image could not be read: {exc}",
            width=0,
            height=0,
            content_hash=content_hash,
        )

    width, height = pil_image.size
    gray = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2GRAY)

    checks: list[QualityCheck] = []

    resolution_ok = width >= MIN_WIDTH and height >= MIN_HEIGHT
    checks.append(
        QualityCheck(
            name="minimum_resolution",
            passed=resolution_ok,
            score=float(min(width, height)),
            threshold=float(min(MIN_WIDTH, MIN_HEIGHT)),
            verdict=QualityVerdict.PASS if resolution_ok else QualityVerdict.RECAPTURE_REQUIRED,
        )
    )

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if blur_score < BLUR_RECAPTURE_THRESHOLD:
        blur_verdict = QualityVerdict.RECAPTURE_REQUIRED
    elif blur_score < BLUR_REVIEW_THRESHOLD:
        blur_verdict = QualityVerdict.REVIEW
    else:
        blur_verdict = QualityVerdict.PASS
    checks.append(
        QualityCheck(
            name="blur",
            passed=blur_verdict == QualityVerdict.PASS,
            score=blur_score,
            threshold=BLUR_RECAPTURE_THRESHOLD,
            verdict=blur_verdict,
        )
    )

    brightness = float(gray.mean())
    if brightness < DARK_RECAPTURE_THRESHOLD:
        dark_verdict = QualityVerdict.RECAPTURE_REQUIRED
    elif brightness < DARK_REVIEW_THRESHOLD:
        dark_verdict = QualityVerdict.REVIEW
    else:
        dark_verdict = QualityVerdict.PASS
    checks.append(
        QualityCheck(
            name="darkness",
            passed=dark_verdict == QualityVerdict.PASS,
            score=brightness,
            threshold=DARK_RECAPTURE_THRESHOLD,
            verdict=dark_verdict,
        )
    )

    overexposed_fraction = float(np.mean(gray > 250))
    overexposure_verdict = (
        QualityVerdict.REVIEW
        if overexposed_fraction > OVEREXPOSURE_REVIEW_FRACTION
        else QualityVerdict.PASS
    )
    checks.append(
        QualityCheck(
            name="overexposure",
            passed=overexposure_verdict == QualityVerdict.PASS,
            score=overexposed_fraction,
            threshold=OVEREXPOSURE_REVIEW_FRACTION,
            verdict=overexposure_verdict,
        )
    )

    overall = _verdict_from_checks(checks)
    reason = None
    if overall != QualityVerdict.PASS:
        failing = [c.name for c in checks if c.verdict != QualityVerdict.PASS]
        reason = f"Failed checks: {', '.join(failing)}"

    return QualityResult(
        checks=checks,
        overall_verdict=overall,
        reason=reason,
        width=width,
        height=height,
        content_hash=content_hash,
    )


def find_duplicate_angles(hashes_by_angle: dict[str, str]) -> list[str]:
    """Exact-hash duplicate detection across the images in ONE scan
    submission — e.g. the same photo submitted for both front and back.
    Returns the angles involved in any duplicate pair, empty if none."""
    seen: dict[str, str] = {}
    duplicates: set[str] = set()
    for angle, content_hash in hashes_by_angle.items():
        if content_hash in seen:
            duplicates.add(angle)
            duplicates.add(seen[content_hash])
        else:
            seen[content_hash] = angle
    return sorted(duplicates)
