"""
Unit tests for measurement/font_height.py — pure image logic, no DB/S3. The
service's own DB/S3 fetch (`_fetch_image_bytes`) is monkeypatched to return
synthetic in-memory PNG bytes instead.
"""

from __future__ import annotations

import io

from PIL import Image, ImageDraw

from app.services.extraction.schema import CalibrationData, EvidenceRef, Point
from app.services.measurement import font_height as font_height_module
from app.services.measurement.font_height import (
    MIN_CALIBRATION_PIXEL_LENGTH,
    PLAUSIBLE_PIXELS_PER_MM_RANGE,
    _crop_and_measure,
    _is_degenerate_bbox,
    measure_font_height,
)


def _render_digits_png(char_height_px: int, n_chars: int = 4, canvas_size=(300, 120)) -> bytes:
    """Draws `n_chars` solid rectangles of exact `char_height_px` height,
    evenly spaced, on a white canvas — a stand-in for numeral strokes with
    a precisely known pixel height, so the measurement's accuracy can be
    checked against ground truth."""
    img = Image.new("RGB", canvas_size, "white")
    draw = ImageDraw.Draw(img)
    char_width = 12
    gap = 10
    y0 = (canvas_size[1] - char_height_px) // 2
    x = 20
    for _ in range(n_chars):
        draw.rectangle([x, y0, x + char_width, y0 + char_height_px], fill="black")
        x += char_width + gap
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _calibration(**overrides) -> CalibrationData:
    base = dict(
        field_id="retailSalePrice", image_id="img-1", known_dimension_mm=50.0,
        start_point=Point(x=0, y=0), end_point=Point(x=100, y=0),
        pixel_length=100.0, calibrated_by="officer-1",
        calibrated_at="2026-01-01T00:00:00Z",
    )
    base.update(overrides)
    # pixels_per_mm is a stored field, not auto-derived — keep it consistent
    # with pixel_length/known_dimension_mm unless a test deliberately
    # overrides it to construct an inconsistent/implausible scenario.
    if "pixels_per_mm" not in overrides:
        base["pixels_per_mm"] = base["pixel_length"] / base["known_dimension_mm"]
    return CalibrationData(**base)


def _evidence_ref(bbox) -> EvidenceRef:
    return EvidenceRef(image_id="img-1", image_angle="front", provider="paddleocr", bbox=bbox)


def test_degenerate_bbox_detected():
    assert _is_degenerate_bbox((0.0, 0.0, 1.0, 1.0)) is True
    assert _is_degenerate_bbox(None) is True
    assert _is_degenerate_bbox((10.0, 10.0, 50.0, 30.0)) is False


def test_crop_and_measure_recovers_known_character_height():
    png_bytes = _render_digits_png(char_height_px=40)
    result = _crop_and_measure(png_bytes, bbox=(0, 0, 300, 120))
    assert result is not None
    median_height, heights = result
    assert len(heights) == 4
    # Otsu thresholding + connected components on a clean synthetic render
    # should recover the exact drawn height (or within 1px of it).
    assert abs(median_height - 40) <= 1


def test_crop_and_measure_returns_none_for_blank_region():
    img = Image.new("RGB", (100, 100), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    result = _crop_and_measure(buf.getvalue(), bbox=(0, 0, 100, 100))
    assert result is None


# --- (G) degenerate Gemini-fallback bbox → insufficient_evidence -----------

def test_measure_font_height_degenerate_bbox_is_insufficient_evidence():
    calibration = _calibration()
    evidence_ref = _evidence_ref((0.0, 0.0, 1.0, 1.0))
    result = measure_font_height(calibration, evidence_ref, db=None, settings=None)
    assert result.status == "insufficient_evidence"


# --- (E) too-short calibration line → insufficient_calibration -------------

def test_measure_font_height_short_calibration_line():
    calibration = _calibration(pixel_length=MIN_CALIBRATION_PIXEL_LENGTH - 1)
    evidence_ref = _evidence_ref((10, 10, 50, 30))
    result = measure_font_height(calibration, evidence_ref, db=None, settings=None)
    assert result.status == "insufficient_calibration"


# --- (F) implausible geometry → unreliable_geometry -------------------------

def test_measure_font_height_implausible_pixels_per_mm():
    low, high = PLAUSIBLE_PIXELS_PER_MM_RANGE
    calibration = _calibration(pixel_length=100.0, known_dimension_mm=100.0 / (high + 10))
    evidence_ref = _evidence_ref((10, 10, 50, 30))
    result = measure_font_height(calibration, evidence_ref, db=None, settings=None)
    assert result.status == "unreliable_geometry"
    _ = low  # unused, kept for readability of the bound this test targets


# --- (A) reliable calibration + real measurement ----------------------------

def test_measure_font_height_end_to_end_reliable(monkeypatch):
    png_bytes = _render_digits_png(char_height_px=40)
    monkeypatch.setattr(font_height_module, "_fetch_image_bytes", lambda *a, **k: png_bytes)

    # pixels_per_mm = 4.0 -> 40px / 4.0 = 10mm measured height.
    calibration = _calibration(pixel_length=100.0, known_dimension_mm=25.0)
    evidence_ref = _evidence_ref((0, 0, 300, 120))

    result = measure_font_height(calibration, evidence_ref, db=None, settings=None)
    assert result.status == "measured"
    assert result.measured_height_mm is not None
    assert abs(result.measured_height_mm - 10.0) < 0.5
    assert result.confidence > 0.6
    assert "component_heights_px" in result.evidence


# --- (H) zero usable connected components -> insufficient_evidence ---------

def test_measure_font_height_no_components(monkeypatch):
    img = Image.new("RGB", (100, 100), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    monkeypatch.setattr(font_height_module, "_fetch_image_bytes", lambda *a, **k: buf.getvalue())

    calibration = _calibration()
    evidence_ref = _evidence_ref((0, 0, 100, 100))
    result = measure_font_height(calibration, evidence_ref, db=None, settings=None)
    assert result.status == "insufficient_evidence"
