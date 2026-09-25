"""
scripts/ocr_benchmark.py — manual/periodic OCR provider comparison
harness. NOT wired into the app: no API route, no UI, never imported by
`app/`, matching this repo's existing precedent for this kind of
read-only reporting tool (`services/ocr/openparser/shadow_comparison.py`'s
own docstring: "Not exposed anywhere officers can see"). Run by hand
before flipping `OPENPARSER_FALLBACK_ENABLED` on anywhere real, to
validate that the configured escalation model(s) actually improve recall
on DigiPramaan's real photographed-packaging distribution — published
OCR benchmarks target scanned documents, not this input distribution, so
this is the only reliable validation available.

One `/parse/batch` call submits the SAME set of images once per
configured model (`OPENPARSER_COMPARISON_MODELS`, comma-separated —
confirmed via the OpenParser OpenAPI contract that batch items can each
specify a different `ocr_model`, no batch-level constraint), then reports
per-model block/character counts, and — with `--full-pipeline` — per-
field structuring success by feeding each model's blocks through the
existing `structure()` function and comparing `not_detected` rates.

Usage:
    python scripts/ocr_benchmark.py --images-dir path/to/sample/images
    python scripts/ocr_benchmark.py --images-dir path/to/sample/images --full-pipeline
    python scripts/ocr_benchmark.py --images-dir path/to/sample/images --models paddleocr-vl-1.6,azure-di-read --json

Images are treated as independent single-page documents — angle/field
context (front/back/side_pdp) is irrelevant to this harness; it measures
raw per-model text recall, not compliance outcomes, unless --full-pipeline
also runs the real structuring step (still angle-agnostic; every image is
treated as "front" for that pass, since the harness has no per-image
angle metadata of its own — good enough for a recall comparison, not a
substitute for a live pipeline run).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import get_settings
from app.services.ocr.openparser.client import OpenParserClient

_CONTENT_TYPE_BY_EXTENSION = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
}

_TERMINAL_STATES = frozenset({"succeeded", "failed", "indeterminate"})
_POLL_INTERVAL_SECONDS = 2.0
_POLL_TIMEOUT_SECONDS = 300.0


@dataclass
class ModelResult:
    model_id: str
    image_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    total_elements: int = 0
    total_characters: int = 0
    not_detected_field_ids: list[str] = field(default_factory=list)  # only with --full-pipeline


def _load_images(images_dir: Path) -> list[tuple[str, bytes, str]]:
    """Returns (filename, bytes, content_type) tuples, ordered, for every
    supported image file directly inside `images_dir`."""
    files: list[tuple[str, bytes, str]] = []
    for path in sorted(images_dir.iterdir()):
        content_type = _CONTENT_TYPE_BY_EXTENSION.get(path.suffix.lower())
        if content_type is None or not path.is_file():
            continue
        files.append((path.name, path.read_bytes(), content_type))
    return files


def _submit_batch(client: OpenParserClient, model_id: str, files: list[tuple[str, bytes, str]]):
    items = [
        {"client_item_id": f"{model_id}-{i}", "file_index": i, "ocr_model": model_id}
        for i in range(len(files))
    ]
    return client.submit_parse_batch(
        items=items, files=files, idempotency_key=f"ocr-benchmark-{model_id}-{uuid.uuid4()}",
    )


def _poll_until_terminal(client: OpenParserClient, job_id: str):
    deadline = time.monotonic() + _POLL_TIMEOUT_SECONDS
    while True:
        job = client.get_job(job_id)
        if job.status in _TERMINAL_STATES:
            return job
        if time.monotonic() >= deadline:
            raise TimeoutError(f"Batch job {job_id} did not reach a terminal state within {_POLL_TIMEOUT_SECONDS}s")
        time.sleep(_POLL_INTERVAL_SECONDS)


def _summarize_child_result(result: dict) -> tuple[int, int]:
    """(element_count, character_count) from a single child's
    `openparser@1` ParsedDocument dict — untyped/defensive, since
    `Job.result`/`children` are deliberately left as raw dicts by this
    client (see schemas.py's own comment)."""
    elements = result.get("elements") or []
    text = result.get("text") or ""
    return len(elements), len(text)


def run_benchmark(images_dir: Path, model_ids: list[str], *, full_pipeline: bool) -> list[ModelResult]:
    settings = get_settings()
    files = _load_images(images_dir)
    if not files:
        raise SystemExit(f"No supported images found in {images_dir}")

    results: list[ModelResult] = []
    with OpenParserClient(settings) as client:
        for model_id in model_ids:
            result = ModelResult(model_id=model_id, image_count=len(files))
            accepted = _submit_batch(client, model_id, files)
            job = _poll_until_terminal(client, accepted.id)

            children = (job.children or {}).get("items", [])
            for child in children:
                status = child.get("status")
                if status == "succeeded":
                    result.succeeded_count += 1
                    child_result = child.get("result") or {}
                    element_count, char_count = _summarize_child_result(child_result)
                    result.total_elements += element_count
                    result.total_characters += char_count
                else:
                    result.failed_count += 1

            if full_pipeline:
                result.not_detected_field_ids = _run_structuring_pass(job, model_id, settings)

            results.append(result)
    return results


def _run_structuring_pass(job, model_id: str, settings) -> list[str]:
    """Feeds this model's recovered text through the real structure()
    function and reports which required fields still read not_detected —
    every image is treated as a single "front" angle document for this
    pass (the harness has no per-image angle metadata); good enough for a
    recall comparison, not a claim about a real multi-angle scan."""
    from app.jobs.pipeline import REQUIRED_FIELD_IDS
    from app.services.ocr.gemini import structure
    from app.services.ocr.provider import OcrBlock

    blocks: list[OcrBlock] = []
    angle_by_image_id: dict[str, str] = {}
    children = (job.children or {}).get("items", [])
    for i, child in enumerate(children):
        if child.get("status") != "succeeded":
            continue
        image_id = str(child.get("client_item_id", i))
        angle_by_image_id[image_id] = "front"
        result = child.get("result") or {}
        for element in result.get("elements") or []:
            text = element.get("text")
            if not text:
                continue
            confidence = ((element.get("confidence") or {}).get("score") or 0.0) * 100.0
            blocks.append(
                OcrBlock(
                    image_id=image_id, text=text, confidence=confidence,
                    bbox=(0.0, 0.0, 1.0, 1.0), provider="openparser", model=model_id,
                )
            )

    if not blocks:
        return list(REQUIRED_FIELD_IDS)

    extraction = structure(blocks, angle_by_image_id, settings)
    return [
        field_id for field_id in REQUIRED_FIELD_IDS
        if getattr(extraction, field_id, None) is None or getattr(extraction, field_id).not_detected
    ]


def _print_table(results: list[ModelResult], *, full_pipeline: bool) -> None:
    header = f"{'Model':<22} {'OK':>4} {'Fail':>5} {'Elements':>9} {'Chars':>8}"
    if full_pipeline:
        header += "  Missing required fields"
    print(header)
    print("-" * len(header))
    for r in results:
        line = f"{r.model_id:<22} {r.succeeded_count:>4} {r.failed_count:>5} {r.total_elements:>9} {r.total_characters:>8}"
        if full_pipeline:
            line += "  " + (", ".join(r.not_detected_field_ids) or "(none)")
        print(line)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--images-dir", required=True, type=Path, help="Directory of sample JPEG/PNG images")
    parser.add_argument("--models", default=None, help="Comma-separated ocr_model ids (default: OPENPARSER_COMPARISON_MODELS)")
    parser.add_argument("--full-pipeline", action="store_true", help="Also run each model's blocks through structure()")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON instead of a table")
    args = parser.parse_args()

    model_ids = args.models.split(",") if args.models else get_settings().openparser_comparison_model_list
    results = run_benchmark(args.images_dir, model_ids, full_pipeline=args.full_pipeline)

    if args.json:
        json.dump([r.__dict__ for r in results], sys.stdout, indent=2)
        print()
    else:
        _print_table(results, full_pipeline=args.full_pipeline)


if __name__ == "__main__":
    main()
