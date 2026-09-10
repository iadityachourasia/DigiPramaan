"""
ocr/paddle.py — PaddleOCR provider. Primary, per the Phase 2 go/no-go spike.

CRITICAL: `enable_mkldnn=False` is not a style choice — it is required.
This environment's paddlepaddle 3.3.1 CPU build crashes inside its oneDNN
inference path with `NotImplementedError:
(Unimplemented) ConvertPirAttribute2RuntimeAttribute not support
[pir::ArrayAttribute<pir::DoubleAttribute>]` on ANY predict() call with
oneDNN enabled (confirmed against the real text-detection model, not a
guess). Disabling it costs some CPU throughput but is the difference
between "works" and "crashes on every single image."

The `PaddleOCR` instance is expensive to construct (loads several ONNX/
Paddle models, ~1-10s) — held as a module-level singleton, built once per
process, not per request.
"""

from __future__ import annotations

import time

from app.services.ocr.provider import OcrBlock, OcrResult

_ocr_instance = None


def _get_ocr_instance():
    global _ocr_instance
    if _ocr_instance is None:
        from paddleocr import PaddleOCR

        _ocr_instance = PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,  # see module docstring — required, not optional
        )
    return _ocr_instance


class PaddleOcrProvider:
    name = "paddleocr"

    def extract(self, image_bytes: bytes, image_id: str) -> OcrResult:
        import tempfile
        from pathlib import Path

        ocr = _get_ocr_instance()
        started = time.perf_counter()

        # paddleocr's predict() takes a path (or ndarray) — bytes go to a
        # short-lived temp file rather than teaching it to read a stream.
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            results = ocr.predict(tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        blocks: list[OcrBlock] = []
        for page in results:
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            boxes = page.get("rec_boxes", [])
            for text, score, box in zip(texts, scores, boxes):
                x0, y0, x1, y1 = (float(v) for v in box)
                blocks.append(
                    OcrBlock(
                        image_id=image_id,
                        text=text,
                        confidence=float(score) * 100,
                        bbox=(x0, y0, x1, y1),
                        provider=self.name,
                    )
                )

        duration_ms = (time.perf_counter() - started) * 1000
        return OcrResult(blocks=blocks, provider=self.name, duration_ms=duration_ms)
