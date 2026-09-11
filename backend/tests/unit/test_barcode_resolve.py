"""
Unit tests for services/barcode/resolve.py — pure, deterministic merge
across all three images' decode results. Covers the task's own scenarios
6/7 (dedup across images, conflicting valid barcodes -> NEEDS_REVIEW) plus
the one-valid-one-invalid and zero-candidate cases.
"""

from __future__ import annotations

from app.services.barcode.resolve import resolve_barcode_analysis
from app.services.barcode.types import BarcodeDecodeResult


def _result(
    raw: str, normalized: str, valid: bool, angle: str, image_id: str = "img-1",
    decoder: str = "zxing_full_image", detection_method: str = "full_image",
) -> BarcodeDecodeResult:
    return BarcodeDecodeResult(
        raw_value=raw, normalized_value=normalized, symbology="EAN_13", checksum_valid=valid,
        source_image_id=image_id, source_angle=angle, bbox=None,
        decoder=decoder, detection_method=detection_method,
    )


def test_no_candidates_is_none_status():
    analysis = resolve_barcode_analysis([])
    assert analysis.status == "none"
    assert analysis.trusted_identifier is None
    assert analysis.candidates == []


def test_single_valid_candidate_is_trusted():
    result = _result("8901234567814", "08901234567814", True, "front")
    analysis = resolve_barcode_analysis([result])
    assert analysis.status == "trusted"
    assert analysis.trusted_identifier == result


def test_same_barcode_on_front_and_back_is_deduplicated():
    front = _result("8901234567814", "08901234567814", True, "front")
    back = _result("8901234567814", "08901234567814", True, "back", image_id="img-2")
    analysis = resolve_barcode_analysis([front, back])
    assert analysis.status == "trusted"
    assert len(analysis.candidates) == 1  # deduplicated to one candidate entry
    assert analysis.trusted_identifier.raw_value == "8901234567814"


def test_conflicting_valid_barcodes_needs_review():
    first = _result("8901234567814", "08901234567814", True, "front")
    second = _result("1234567890128", "01234567890128", True, "back", image_id="img-2")
    analysis = resolve_barcode_analysis([first, second])
    assert analysis.status == "needs_review"
    assert analysis.trusted_identifier is None
    assert len(analysis.candidates) == 2  # both shown, neither silently picked


def test_one_valid_one_invalid_trusts_only_the_valid_one():
    valid = _result("8901234567814", "08901234567814", True, "front")
    invalid = _result("9999999999990", "09999999999990", False, "back", image_id="img-2")
    analysis = resolve_barcode_analysis([valid, invalid])
    assert analysis.status == "trusted"
    assert analysis.trusted_identifier.raw_value == "8901234567814"
    # the invalid one is retained as evidence, never silently dropped
    assert any(c.raw_value == "9999999999990" for c in analysis.candidates)


def test_only_invalid_candidates_is_none_status():
    invalid = _result("9999999999990", "09999999999990", False, "front")
    analysis = resolve_barcode_analysis([invalid])
    assert analysis.status == "none"
    assert analysis.trusted_identifier is None
    assert len(analysis.candidates) == 1  # still retained as extraction evidence
