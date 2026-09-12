"""
Unit tests for ocr/paddle.py's PaddleOcrProvider — the resize-before-
inference speedup, the bbox-rescale-back-to-original-pixel-space invariant
(Rule 7 font-height measurement, evidence crops, and report rendering all
assume OcrBlock.bbox is in the ORIGINAL image's pixel space, regardless of
what PaddleOCR itself saw), and the subprocess boundary around predict().

`_predict_in_subprocess` (not `_get_ocr_instance`) is the seam these tests
mock: predict() runs in a genuine spawned subprocess (see the module
docstring for why — a real, reproduced hang when run inline on a
BackgroundTasks worker thread), so a patch on `_get_ocr_instance` in this
process would never reach the child process's fresh import of the module.
"""

from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from PIL import Image

from app.services.ocr.paddle import OCR_MAX_DIMENSION_PX, PaddleOcrProvider


def _image_bytes(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(255, 255, 255)).save(buf, format="PNG")
    return buf.getvalue()


def test_oversized_image_is_downscaled_before_ocr():
    """The actual file handed to PaddleOCR must be capped at
    OCR_MAX_DIMENSION_PX on its longest side — this is the whole point of
    the optimization (less pixel data for PaddleOCR to decode/detect on)."""
    original_width, original_height = 2400, 3200  # well above the cap
    image_bytes = _image_bytes(original_width, original_height)

    seen_sizes: list[tuple[int, int]] = []

    def fake_predict(tmp_path):
        with Image.open(tmp_path) as img:
            seen_sizes.append(img.size)
        return [{"rec_texts": [], "rec_scores": [], "rec_boxes": []}]

    provider = PaddleOcrProvider()
    with patch("app.services.ocr.paddle._predict_in_subprocess", side_effect=fake_predict):
        provider.extract(image_bytes, image_id="img-1")

    assert len(seen_sizes) == 1
    seen_width, seen_height = seen_sizes[0]
    assert max(seen_width, seen_height) == OCR_MAX_DIMENSION_PX
    # Aspect ratio preserved (never stretched).
    assert seen_width / seen_height == pytest.approx(original_width / original_height, rel=0.01)


def test_bbox_is_rescaled_back_to_original_pixel_space():
    """The CRITICAL invariant: whatever bbox PaddleOCR reports (in the
    downscaled image's pixel space) must come back out of extract() in
    the ORIGINAL image's pixel space, unchanged from what a caller would
    have seen before this optimization existed."""
    original_width, original_height = 3200, 4000
    image_bytes = _image_bytes(original_width, original_height)

    # The exact bbox PaddleOCR would report against the DOWNSCALED image
    # it was actually given.
    downscaled_bbox = (10.0, 20.0, 110.0, 60.0)
    fake_page = {
        "rec_texts": ["MRP: Rs 100"],
        "rec_scores": [0.95],
        "rec_boxes": [list(downscaled_bbox)],
    }

    seen_sizes: list[tuple[int, int]] = []

    def fake_predict(tmp_path):
        with Image.open(tmp_path) as img:
            seen_sizes.append(img.size)
        return [fake_page]

    provider = PaddleOcrProvider()
    with patch("app.services.ocr.paddle._predict_in_subprocess", side_effect=fake_predict):
        result = provider.extract(image_bytes, image_id="img-1")

    assert len(result.blocks) == 1
    block = result.blocks[0]
    assert block.text == "MRP: Rs 100"

    seen_width, _seen_height = seen_sizes[0]
    scale = seen_width / original_width
    expected_bbox = tuple(v / scale for v in downscaled_bbox)
    assert block.bbox == pytest.approx(expected_bbox, rel=0.01)

    # And concretely: the rescaled bbox must be LARGER than what PaddleOCR
    # reported, by the same factor the image was shrunk — never left in
    # the downscaled image's own (smaller) coordinate space.
    assert block.bbox[2] > downscaled_bbox[2]


def test_small_image_is_not_upscaled_or_rescaled():
    """An image already at or under the cap must pass through unchanged
    — no upscaling, and bbox values must come back byte-for-byte (scale
    factor of exactly 1.0, not an approximation that drifts real data)."""
    original_width, original_height = 800, 600  # already under the cap
    image_bytes = _image_bytes(original_width, original_height)

    bbox = (5.0, 6.0, 50.0, 20.0)
    fake_page = {"rec_texts": ["Net Qty: 100g"], "rec_scores": [0.9], "rec_boxes": [list(bbox)]}

    seen_sizes: list[tuple[int, int]] = []

    def fake_predict(tmp_path):
        with Image.open(tmp_path) as img:
            seen_sizes.append(img.size)
        return [fake_page]

    provider = PaddleOcrProvider()
    with patch("app.services.ocr.paddle._predict_in_subprocess", side_effect=fake_predict):
        result = provider.extract(image_bytes, image_id="img-1")

    assert seen_sizes[0] == (original_width, original_height)
    assert result.blocks[0].bbox == bbox


def test_predict_timeout_terminates_process_and_raises():
    """A genuinely hung predict() call (the real failure mode that
    motivated running it in a subprocess) must fail loudly within
    PREDICT_TIMEOUT_SECONDS, not hang the whole pipeline forever."""
    from app.services.ocr import paddle as paddle_module

    class _NeverExits:
        def __init__(self, target, args):
            pass

        def start(self):
            pass

        def join(self, timeout=None):
            pass  # simulates: still running after the timeout

        def is_alive(self):
            return True

        def terminate(self):
            pass

        exitcode = None

    class _FakeQueue:
        def empty(self):
            return True

        def get(self):
            raise AssertionError("should never be read — process never produced a result")

    class _FakeCtx:
        def Queue(self):
            return _FakeQueue()

        def Process(self, target, args):
            return _NeverExits(target, args)

    with patch.object(paddle_module.multiprocessing, "get_context", return_value=_FakeCtx()), \
         patch.object(paddle_module, "PREDICT_TIMEOUT_SECONDS", 0):
        with pytest.raises(TimeoutError):
            paddle_module._predict_in_subprocess("irrelevant.png")
