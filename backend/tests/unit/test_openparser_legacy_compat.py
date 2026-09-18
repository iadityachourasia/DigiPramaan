"""OP-Phase 4 — `to_legacy_ocr_block`'s exact refuse-vs-emit decision rule.
Direct proof of "old records still deserialize": a successfully emitted
block validates against the UNCHANGED `app/services/ocr/provider.py`
model."""

from __future__ import annotations

from app.services.ocr.openparser.confidence import OcrConfidence
from app.services.ocr.openparser.normalize import OcrElement, to_legacy_ocr_block
from app.services.ocr.provider import OcrBlock


def _element(**overrides) -> OcrElement:
    base = dict(
        element_id="el-1",
        provider_element_id="el_text_net_qty",
        image_id="img-1",
        angle="front",
        page_number=1,
        text="Net Quantity: 500 g",
        element_type="text:line",
        confidence=OcrConfidence(score=0.87, scope="recognition", calibrated=False),
        bbox_source=(120.0, 340.0, 520.0, 380.0),
        coordinate_unit="pixel",
        page_width=1600.0,
        page_height=1200.0,
        bbox_original_px=(120.0, 340.0, 520.0, 380.0),
        provider="openparser",
        model="paddleocr-vl-1.6",
        output_format="openparser@1",
        profile_version="openparser-quality-max-v1",
        provider_job_id="opj_example",
        attempt_id="attempt-1",
        input_sha256="a" * 64,
        canonical_result_sha256="b" * 64,
    )
    base.update(overrides)
    return OcrElement(**base)


def test_emits_a_valid_legacy_ocr_block_when_confidence_and_pixel_bbox_are_both_present() -> None:
    element = _element()
    block = to_legacy_ocr_block(element)
    assert block is not None
    # The direct "old records still deserialize" proof: round-trips
    # through the UNCHANGED provider.py model unchanged.
    revalidated = OcrBlock.model_validate(block.model_dump())
    assert revalidated.image_id == "img-1"
    assert revalidated.text == "Net Quantity: 500 g"
    assert revalidated.confidence == 87.0  # 0.87 * 100, OcrBlock's 0-100 scale
    assert revalidated.bbox == (120.0, 340.0, 520.0, 380.0)
    assert revalidated.provider == "openparser"


def test_refuses_when_confidence_is_absent() -> None:
    element = _element(confidence=None)
    assert to_legacy_ocr_block(element) is None


def test_refuses_when_pixel_bbox_is_unmapped() -> None:
    element = _element(bbox_original_px=None)
    assert to_legacy_ocr_block(element) is None


def test_refuses_when_both_are_absent() -> None:
    element = _element(confidence=None, bbox_original_px=None)
    assert to_legacy_ocr_block(element) is None


def test_emits_even_for_a_non_recognition_scope_confidence() -> None:
    """to_legacy_ocr_block only checks non-None — filtering to
    recognition-scope-only is a caller decision via
    confidence.is_recognition_confidence, tested separately."""
    element = _element(confidence=OcrConfidence(score=0.95, scope="detection", calibrated=False))
    block = to_legacy_ocr_block(element)
    assert block is not None
    assert block.confidence == 95.0
