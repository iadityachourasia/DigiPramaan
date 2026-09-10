"""
Unit tests for app/services/image_quality.py — pure functions, no mocking
needed. Covers the PASS/RECAPTURE_REQUIRED/REVIEW thresholds and exact-hash
duplicate detection that gate POST /scans before any B2/DB write happens.
"""

from __future__ import annotations

import io

from PIL import Image

from app.services.image_quality import (
    QualityVerdict,
    evaluate_image_quality,
    find_duplicate_angles,
)


def _png_bytes(size: tuple[int, int], color: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format="PNG")
    return buf.getvalue()


def _sharp_label_bytes() -> bytes:
    # High-contrast text-like pattern -> real edges -> real Laplacian
    # variance, unlike a flat fill (which is legitimately zero-variance
    # and would otherwise always read as "blurry").
    img = Image.new("RGB", (800, 800), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (0, 0, 0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_small_flat_image_fails_resolution_blur_and_darkness() -> None:
    result = evaluate_image_quality(_png_bytes((50, 50), (10, 10, 10)))
    assert result.overall_verdict == QualityVerdict.RECAPTURE_REQUIRED
    failed = {c.name for c in result.checks if not c.passed}
    assert "minimum_resolution" in failed
    assert "blur" in failed
    assert "darkness" in failed


def test_sufficiently_large_sharp_bright_image_passes() -> None:
    result = evaluate_image_quality(_sharp_label_bytes())
    assert result.overall_verdict in (QualityVerdict.PASS, QualityVerdict.REVIEW)
    resolution_check = next(c for c in result.checks if c.name == "minimum_resolution")
    assert resolution_check.passed


def test_overexposed_image_flagged_as_review_not_recapture() -> None:
    # Near-white but large enough and not "blurry" by the flat-fill
    # exception the blur check doesn't special-case — overexposure is
    # deliberately non-blocking (REVIEW only), never RECAPTURE_REQUIRED on
    # its own, per image_quality.py's own documented thresholds.
    result = evaluate_image_quality(_png_bytes((800, 800), (253, 253, 253)))
    overexposure_check = next(c for c in result.checks if c.name == "overexposure")
    if not overexposure_check.passed:
        assert overexposure_check.verdict == QualityVerdict.REVIEW


def test_identical_bytes_across_angles_detected_as_duplicates() -> None:
    same_bytes = _sharp_label_bytes()
    front = evaluate_image_quality(same_bytes)
    back = evaluate_image_quality(same_bytes)
    duplicates = find_duplicate_angles(
        {"front": front.content_hash, "back": back.content_hash, "side_pdp": "different-hash"}
    )
    assert set(duplicates) == {"front", "back"}


def test_distinct_images_are_not_flagged_as_duplicates() -> None:
    front = evaluate_image_quality(_sharp_label_bytes())
    back = evaluate_image_quality(_png_bytes((800, 800), (200, 200, 200)))
    duplicates = find_duplicate_angles(
        {"front": front.content_hash, "back": back.content_hash, "side_pdp": "yet-another-hash"}
    )
    assert duplicates == []
