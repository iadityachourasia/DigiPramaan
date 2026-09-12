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

Real phone photos routinely arrive well above 3000px on a side (a modern
camera's native resolution) — decoding and running detection+recognition
on the full original is real, measurable CPU time this codebase cannot
spend twice (PaddleX's own internal preprocessing already caps at
4000px, but everything before that cap — decode, color conversion, its
own resize step — still runs on the full original otherwise). OCR_MAX_
DIMENSION_PX matches reports/images.py's own ORIGINAL_MAX_DIMENSION_PX
(1600px) — already validated in this codebase as legible for a human
reviewing evidence, and OCR's recognition step re-crops/resizes each
detected text region to its own small canonical height regardless of the
source resolution anyway, so this costs negligible accuracy.

CRITICAL invariant this MUST preserve: every bbox this provider returns
must land in the ORIGINAL image's pixel space, never the downscaled copy
PaddleOCR actually saw — Rule 7 font-height measurement, evidence crops,
and report rendering all assume OcrBlock.bbox is original-image pixels
(never normalized, never resized-image-relative). `extract()` rescales
every box by the inverse of whatever scale factor it applied, immediately,
before returning — no downstream code has any way to know a resize
happened.

CRITICAL: the actual `ocr.predict()` call runs in a genuine subprocess
(`_predict_in_subprocess`), never inline in the caller's thread. Found
during real end-to-end testing: `run_pipeline` is invoked via FastAPI's
`BackgroundTasks`, which runs a sync callable on a worker THREAD (not a
new process) inside the same interpreter as the async event loop. In
that specific context, `PaddleOCR.predict()` reliably stalled for 10-20+
minutes at near-zero CPU usage (confirmed via direct process CPU
sampling — this is a hang, not slow computation, and raising the OS
thread's scheduling priority made no difference). The identical call
against the identical image, run as a plain script's main thread (or in
its own freshly spawned process), completed in ~70-90 seconds every
time. Root cause not fully isolated (suspected: something in paddle's
own C++ side assumes it owns the process's main thread), but running
predict() in a fresh process sidesteps it entirely and is what every
manual reproduction confirmed as reliably fast.
"""

from __future__ import annotations

import multiprocessing
import time

from app.services.ocr.provider import OcrBlock, OcrResult

OCR_MAX_DIMENSION_PX = 1600

# Generous relative to the ~70-90s observed for a real, dense product-label
# photo at OCR_MAX_DIMENSION_PX — this exists so a genuine hang fails loudly
# (textExtraction -> failed, surfaced to the officer) instead of blocking a
# scan forever, the exact failure mode that motivated moving predict() into
# a subprocess in the first place.
PREDICT_TIMEOUT_SECONDS = 240

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


def _predict_worker(tmp_path: str, result_queue) -> None:
    """Entry point for the subprocess spawned by `_predict_in_subprocess`
    — see module docstring for why this must not run inline. Must only
    put plain, picklable data (str/float/list) on the queue."""
    try:
        ocr = _get_ocr_instance()
        results = ocr.predict(tmp_path)
        pages = [
            {
                "rec_texts": list(page.get("rec_texts", [])),
                "rec_scores": [float(s) for s in page.get("rec_scores", [])],
                "rec_boxes": [[float(v) for v in box] for box in page.get("rec_boxes", [])],
            }
            for page in results
        ]
        result_queue.put(("ok", pages))
    except Exception as exc:  # noqa: BLE001 - forward any failure to the parent, never crash silently
        result_queue.put(("error", str(exc)))


def _predict_in_subprocess(tmp_path: str) -> list[dict]:
    ctx = multiprocessing.get_context("spawn")
    result_queue = ctx.Queue()
    process = ctx.Process(target=_predict_worker, args=(tmp_path, result_queue))
    process.start()
    process.join(PREDICT_TIMEOUT_SECONDS)
    if process.is_alive():
        process.terminate()
        process.join()
        raise TimeoutError(f"PaddleOCR predict() exceeded {PREDICT_TIMEOUT_SECONDS}s and was terminated.")
    if result_queue.empty():
        raise RuntimeError(f"PaddleOCR subprocess exited with no result (exit code {process.exitcode}).")
    status, payload = result_queue.get()
    if status == "error":
        raise RuntimeError(f"PaddleOCR subprocess failed: {payload}")
    return payload


class PaddleOcrProvider:
    name = "paddleocr"

    def extract(self, image_bytes: bytes, image_id: str) -> OcrResult:
        import tempfile
        from io import BytesIO
        from pathlib import Path

        from PIL import Image

        started = time.perf_counter()

        # Downscale before handing to PaddleOCR — see module docstring for
        # why, and for the bbox-rescaling invariant this preserves.
        with Image.open(BytesIO(image_bytes)) as original_image:
            original_image = original_image.convert("RGB")
            original_width, original_height = original_image.size
            longest_side = max(original_width, original_height)
            if longest_side > OCR_MAX_DIMENSION_PX:
                scale = OCR_MAX_DIMENSION_PX / longest_side
                resized_image = original_image.resize(
                    (max(1, round(original_width * scale)), max(1, round(original_height * scale))),
                    Image.LANCZOS,
                )
            else:
                scale = 1.0
                resized_image = original_image

            # paddleocr's predict() takes a path (or ndarray) — the image
            # goes to a short-lived temp file rather than teaching it to
            # read a stream.
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                resized_image.save(tmp, format="PNG")
                tmp_path = tmp.name

        try:
            results = _predict_in_subprocess(tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        # PaddleOCR's boxes are in the DOWNSCALED image's pixel space —
        # rescale by the inverse factor so every returned bbox lands back
        # in the ORIGINAL image's pixel space (see module docstring).
        inverse_scale = 1.0 / scale

        blocks: list[OcrBlock] = []
        for page in results:
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            boxes = page.get("rec_boxes", [])
            for text, score, box in zip(texts, scores, boxes):
                x0, y0, x1, y1 = (float(v) * inverse_scale for v in box)
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
