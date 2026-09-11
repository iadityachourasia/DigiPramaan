"""
reports/images.py — fetches real evidence-image bytes from B2 ONCE per
report generation, optimizes them for embedding, and writes them to a
temporary local directory the Node renderer reads from.

The renderer itself never touches B2/the DB — this is the one place that
does, and it does so exactly once per generation (never on download,
never more than once per generation attempt). All bboxes handled here are
real-image PIXEL coordinates (x0,y0,x1,y1) against the ORIGINAL,
pre-resize image — the same coordinate space PaddleOCR's `rec_boxes` and
the rule engine's own evidence dicts already use (Gemini's OCR-fallback
path stamps a (0,0,1,1) sentinel for "no real geometry", never a genuine
tiny pixel box — see rules/checks.py's `_is_degenerate_bbox`, already
applied upstream in snapshot.py so every bbox reaching this module is
real).

Resize targets (no existing telemetry to calibrate against, so these are
deliberately generous rather than tight): 1600px long edge for full
originals (comfortably above A4-at-150dpi print width with headroom for a
landscape photo, keeps each JPEG in the ~150-400KB range), 1000px for
violation crops (inherently smaller regions, need less), JPEG quality 85
(the standard "visually lossless for photographic evidence, ~40% smaller
than 95" tradeoff). A crop is taken from the ORIGINAL full-resolution
image before any downscaling, so it keeps more effective detail than a
naive resize-then-crop would.
"""

from __future__ import annotations

import io
import shutil
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageOps
from sqlalchemy.orm import Session as DbSession

from app.core.config import Settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage
from app.services.reports.schema import ReportSnapshotV2

ORIGINAL_MAX_DIMENSION_PX = 1600
CROP_MAX_DIMENSION_PX = 1000
JPEG_QUALITY = 85
CROP_PADDING_RATIO = 0.15

_ANGLE_ATTRS = ("front", "back", "side_pdp")


@dataclass
class ReportImagePaths:
    front: Path | None = None
    back: Path | None = None
    side_pdp: Path | None = None
    violation_crops: dict[str, Path] = field(default_factory=dict)
    # image_id -> (width, height) of the ORIGINAL, pre-resize image — used
    # by the orchestrator to patch ImageReference.image_width_px/height_px
    # so the renderer can scale a pixel-space bbox onto the resized,
    # placed image it actually draws.
    original_dimensions: dict[str, tuple[int, int]] = field(default_factory=dict)
    # angle / crop_image_ref -> (width, height) of the file ACTUALLY
    # WRITTEN to disk (post-resize) — passed through to the Node renderer
    # so it can size a DOCX ImageRun correctly without needing its own
    # image-dimension-reading dependency (jsPDF's own getImageProperties()
    # already covers the PDF path; this is DOCX's equivalent).
    embedded_dimensions: dict[str, tuple[int, int]] = field(default_factory=dict)


def _fetch_bytes(storage_key: str, settings: Settings) -> bytes:
    client = get_s3_client(settings)
    obj = client.get_object(Bucket=settings.s3_bucket, Key=storage_key)
    return obj["Body"].read()


def _crop_box(bbox: list[float], size: tuple[int, int]) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = bbox
    w, h = size
    pad_x = (x1 - x0) * CROP_PADDING_RATIO
    pad_y = (y1 - y0) * CROP_PADDING_RATIO
    return (
        max(0.0, x0 - pad_x),
        max(0.0, y0 - pad_y),
        min(float(w), x1 + pad_x),
        min(float(h), y1 + pad_y),
    )


@contextmanager
def report_image_workspace(record: ComplianceRecord, snapshot: ReportSnapshotV2, db: DbSession, settings: Settings):
    """Yields a `ReportImagePaths`. Guarantees the temp directory is
    removed on both success and failure — callers must do all their real
    work inside the `with` block; nothing survives it."""
    tempdir = Path(tempfile.mkdtemp(prefix="dp-report-"))
    paths = ReportImagePaths()
    try:
        evidence_rows: list[EvidenceImage] = []
        if record.scan_session_id is not None:
            evidence_rows = (
                db.query(EvidenceImage)
                .filter(EvidenceImage.scan_session_id == record.scan_session_id)
                .all()
            )
        rows_by_id = {str(row.id): row for row in evidence_rows}

        originals_by_image_id: dict[str, Image.Image] = {}
        for ref in snapshot.original_images:
            row = rows_by_id.get(ref.image_id)
            if row is None:
                continue
            try:
                raw = _fetch_bytes(row.storage_key, settings)
                original = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
            except Exception:  # noqa: BLE001 - a missing/corrupt object degrades to omission
                continue

            paths.original_dimensions[ref.image_id] = original.size
            originals_by_image_id[ref.image_id] = original

            resized = original.copy()
            resized.thumbnail((ORIGINAL_MAX_DIMENSION_PX, ORIGINAL_MAX_DIMENSION_PX), Image.LANCZOS)
            out_path = tempdir / f"{ref.image_id}.jpg"
            resized.convert("RGB").save(out_path, "JPEG", quality=JPEG_QUALITY)
            if ref.angle in _ANGLE_ATTRS:
                setattr(paths, ref.angle, out_path)
                paths.embedded_dimensions[ref.angle] = resized.size

        for violation in snapshot.violations:
            if not violation.bbox or not violation.crop_image_ref or violation.original_image is None:
                continue
            original = originals_by_image_id.get(violation.original_image.image_id)
            if original is None:
                continue
            box = _crop_box(violation.bbox, original.size)
            crop = original.crop(box)
            crop.thumbnail((CROP_MAX_DIMENSION_PX, CROP_MAX_DIMENSION_PX), Image.LANCZOS)
            crop_path = tempdir / f"crop-{violation.crop_image_ref}.jpg"
            crop.convert("RGB").save(crop_path, "JPEG", quality=JPEG_QUALITY)
            paths.violation_crops[violation.crop_image_ref] = crop_path
            paths.embedded_dimensions[violation.crop_image_ref] = crop.size

        yield paths
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)
