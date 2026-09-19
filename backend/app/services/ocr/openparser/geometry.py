"""
services/ocr/openparser/geometry.py — OP-Phase 4's coordinate mapper
(spec §12.3). Maps a provider-reported bbox (in whatever `CoordinateUnit`
the page declares) into original-image pixel space — or refuses (`None`)
when the mapping cannot be proven correct. Never returns a best guess:
`measurement/font_height.py` and evidence crops both assume ANY bbox they
receive is exact original-pixel space, so a wrong-but-plausible number
here would be a legally misleading result down the line, not a harmless
approximation. This module is not wired to that caller yet (Phase 5) —
it just has to already behave as if it will be.

`TransformManifest` is the Python-level shape this module expects to
read from `OcrProviderJob.transform_manifest` (a JSONB column already
added in OP-Phase 3 as a generic placeholder — no new migration here).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from app.services.ocr.openparser.normalized_schemas import BBox, DocumentPage

_SUPPORTED_ROTATIONS = (0.0, 90.0, 180.0, 270.0)


@dataclass(frozen=True)
class TransformManifest:
    """`kind="identity"` means the derivative sent to the provider IS the
    original image, byte for byte (Phase 1's own "preserve original"
    invariant) — no crop/resize correction needed, only unit conversion
    and rotation. Any `kind` this module does not recognize (including a
    future homography/perspective shape) is refused, never guessed at."""

    kind: Literal["identity", "crop", "resize", "crop_resize"] = "identity"
    crop_offset_px: tuple[float, float] | None = None  # (x0, y0) in original pixels
    scale: tuple[float, float] | None = None  # (sx, sy), derivative -> original


def _finite_and_ordered(box: tuple[float, float, float, float]) -> bool:
    x0, y0, x1, y1 = box
    if not all(math.isfinite(v) for v in (x0, y0, x1, y1)):
        return False
    return x0 < x1 and y0 < y1


def _validate_and_clamp(
    box: tuple[float, float, float, float], width: int, height: int, tolerance_px: float
) -> tuple[float, float, float, float] | None:
    if not _finite_and_ordered(box):
        return None
    x0, y0, x1, y1 = box
    if x0 < -tolerance_px or y0 < -tolerance_px or x1 > width + tolerance_px or y1 > height + tolerance_px:
        return None
    return (max(0.0, x0), max(0.0, y0), min(float(width), x1), min(float(height), y1))


def _rotate_around_center(
    box: tuple[float, float, float, float], *, page_width: float, page_height: float, degrees: float
) -> tuple[float, float, float, float]:
    """0/90/180/270-only rotation of a page-space bbox around the page
    center. Arbitrary in-between angles are mathematically expressible
    but this pipeline's capture flow only ever produces axis-aligned
    device-orientation rotations — anything else is refused by the
    caller before this helper is ever invoked."""
    x0, y0, x1, y1 = box
    if degrees == 0.0:
        return box
    if degrees == 180.0:
        return (page_width - x1, page_height - y1, page_width - x0, page_height - y0)
    if degrees == 90.0:
        # page rotates 90 deg clockwise; width/height swap.
        return (y0, page_width - x1, y1, page_width - x0)
    if degrees == 270.0:
        return (page_height - y1, x0, page_height - y0, x1)
    raise ValueError(f"unsupported rotation degrees: {degrees!r}")


def map_bbox_to_original_pixels(
    *,
    bbox: BBox,
    unit: Literal["pixel", "point", "inch", "normalized"],
    page: DocumentPage,
    original_width_px: int,
    original_height_px: int,
    transform: TransformManifest | None,
    dpi: float | None = None,
    tolerance_px: float = 1.5,
) -> tuple[float, float, float, float] | None:
    """Returns `(x0, y0, x1, y1)` in original-image pixel space, or
    `None` when the mapping cannot be proven — never a clamped-but-wrong
    guess beyond the small `tolerance_px` band. `dpi` is required for
    `point`/`inch` units; this pipeline has no PDF-render context that
    would supply one today, so those units refuse (`None`) unless a
    caller explicitly has one (e.g. a future PDF ingestion path)."""
    box = (bbox.left, bbox.top, bbox.right, bbox.bottom)
    if not _finite_and_ordered(box):
        return None

    if page.rotation_degrees not in _SUPPORTED_ROTATIONS:
        return None

    # --- unit -> page-pixel space -----------------------------------
    if unit == "pixel":
        page_px_box = box
        page_px_w, page_px_h = page.width, page.height
    elif unit == "normalized":
        page_px_box = (
            box[0] * page.width,
            box[1] * page.height,
            box[2] * page.width,
            box[3] * page.height,
        )
        page_px_w, page_px_h = page.width, page.height
    elif unit in ("point", "inch"):
        if not dpi or dpi <= 0:
            return None
        # 1 point == 1/72 inch; "inch" values convert directly by dpi.
        factor = (dpi / 72.0) if unit == "point" else dpi
        page_px_box = tuple(v * factor for v in box)  # type: ignore[assignment]
        page_px_w, page_px_h = page.width * factor, page.height * factor
    else:
        return None

    # --- rotation, around the (post-unit-conversion) page-pixel center --
    try:
        rotated = _rotate_around_center(
            page_px_box, page_width=page_px_w, page_height=page_px_h, degrees=page.rotation_degrees
        )
    except ValueError:
        return None
    if page.rotation_degrees in (90.0, 270.0):
        page_px_w, page_px_h = page_px_h, page_px_w

    # --- derivative-page-pixel space -> original-image pixel space -----
    transform = transform or TransformManifest()
    if transform.kind == "identity":
        mapped = rotated
    elif transform.kind == "crop":
        if transform.crop_offset_px is None:
            return None
        ox, oy = transform.crop_offset_px
        mapped = (rotated[0] + ox, rotated[1] + oy, rotated[2] + ox, rotated[3] + oy)
    elif transform.kind == "resize":
        if transform.scale is None:
            return None
        sx, sy = transform.scale
        if sx <= 0 or sy <= 0:
            return None
        mapped = (rotated[0] * sx, rotated[1] * sy, rotated[2] * sx, rotated[3] * sy)
    elif transform.kind == "crop_resize":
        if transform.scale is None or transform.crop_offset_px is None:
            return None
        sx, sy = transform.scale
        ox, oy = transform.crop_offset_px
        if sx <= 0 or sy <= 0:
            return None
        mapped = (
            rotated[0] * sx + ox,
            rotated[1] * sy + oy,
            rotated[2] * sx + ox,
            rotated[3] * sy + oy,
        )
    else:
        # Any unrecognized kind — including a future homography/
        # perspective shape — is refused, never guessed at.
        return None

    return _validate_and_clamp(mapped, original_width_px, original_height_px, tolerance_px)
