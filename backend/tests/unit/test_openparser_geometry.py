"""OP-Phase 4 — the coordinate mapper (spec §12.3). One golden case per
required CoordinateUnit (pixel/normalized/point/inch), plus rotation,
crop, resize, and a deliberate perspective refusal, plus bounds/
finiteness refusal cases. Pure functions, no DB, no network."""

from __future__ import annotations

from app.services.ocr.openparser.geometry import TransformManifest, map_bbox_to_original_pixels
from app.services.ocr.openparser.normalized_schemas import BBox, DocumentPage


def _page(**overrides) -> DocumentPage:
    base = dict(number=1, width=1000.0, height=800.0, unit="pixel", rotation_degrees=0.0)
    base.update(overrides)
    return DocumentPage(**base)


def test_pixel_unit_identity_mapping() -> None:
    bbox = BBox(left=10, top=20, right=110, bottom=220)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(),
        original_width_px=1000,
        original_height_px=800,
        transform=TransformManifest(kind="identity"),
    )
    assert result == (10.0, 20.0, 110.0, 220.0)


def test_normalized_unit_scales_by_page_dimensions() -> None:
    bbox = BBox(left=0.1, top=0.1, right=0.5, bottom=0.5)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="normalized",
        page=_page(width=1000.0, height=800.0, unit="normalized"),
        original_width_px=1000,
        original_height_px=800,
        transform=None,
    )
    assert result == (100.0, 80.0, 500.0, 400.0)


def test_point_unit_refuses_without_dpi() -> None:
    bbox = BBox(left=0, top=0, right=72, bottom=72)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="point",
        page=_page(width=612.0, height=792.0, unit="point"),
        original_width_px=1700,
        original_height_px=2200,
        transform=None,
        dpi=None,
    )
    assert result is None


def test_point_unit_succeeds_with_dpi_supplied() -> None:
    # 72pt == 1in; at 200 dpi that's 200px.
    bbox = BBox(left=0, top=0, right=72, bottom=144)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="point",
        page=_page(width=612.0, height=792.0, unit="point"),
        original_width_px=1700,
        original_height_px=2200,
        transform=None,
        dpi=200.0,
    )
    assert result == (0.0, 0.0, 200.0, 400.0)


def test_inch_unit_refuses_without_dpi() -> None:
    bbox = BBox(left=0, top=0, right=1, bottom=1)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="inch",
        page=_page(width=8.5, height=11.0, unit="inch"),
        original_width_px=1700,
        original_height_px=2200,
        transform=None,
        dpi=None,
    )
    assert result is None


def test_inch_unit_succeeds_with_dpi_supplied() -> None:
    bbox = BBox(left=0, top=0, right=1, bottom=2)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="inch",
        page=_page(width=8.5, height=11.0, unit="inch"),
        original_width_px=1700,
        original_height_px=2200,
        transform=None,
        dpi=200.0,
    )
    assert result == (0.0, 0.0, 200.0, 400.0)


def _center_of(box: tuple[float, float, float, float]) -> tuple[float, float]:
    x0, y0, x1, y1 = box
    return ((x0 + x1) / 2, (y0 + y1) / 2)


def test_rotation_preserves_the_page_center_of_a_centered_box() -> None:
    # A box centered on a 1000x800 page stays centered on the rotated
    # page's own center, regardless of rotation angle — a formula-
    # independent invariant (rotation around the center fixes the center).
    bbox = BBox(left=450, top=350, right=550, bottom=450)  # centered at (500, 400)
    for degrees, expected_center in (
        (0.0, (500.0, 400.0)),
        (90.0, (400.0, 500.0)),  # page becomes 800x1000; new center (400,500)
        (180.0, (500.0, 400.0)),
        (270.0, (400.0, 500.0)),
    ):
        result = map_bbox_to_original_pixels(
            bbox=bbox,
            unit="pixel",
            page=_page(rotation_degrees=degrees),
            original_width_px=1000 if degrees in (0.0, 180.0) else 800,
            original_height_px=800 if degrees in (0.0, 180.0) else 1000,
            transform=TransformManifest(kind="identity"),
        )
        assert result is not None, f"rotation {degrees} unexpectedly refused"
        assert _center_of(result) == expected_center


def test_unsupported_rotation_angle_refuses() -> None:
    bbox = BBox(left=10, top=10, right=100, bottom=100)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(rotation_degrees=45.0),
        original_width_px=1000,
        original_height_px=800,
        transform=TransformManifest(kind="identity"),
    )
    assert result is None


def test_crop_transform_adds_the_recorded_offset() -> None:
    bbox = BBox(left=10, top=10, right=50, bottom=50)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(width=200.0, height=200.0),
        original_width_px=1000,
        original_height_px=800,
        transform=TransformManifest(kind="crop", crop_offset_px=(100.0, 50.0)),
    )
    assert result == (110.0, 60.0, 150.0, 100.0)


def test_resize_transform_scales_derivative_pixels_to_original() -> None:
    bbox = BBox(left=10, top=10, right=50, bottom=50)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(width=100.0, height=100.0),
        original_width_px=1000,
        original_height_px=800,
        transform=TransformManifest(kind="resize", scale=(2.0, 2.0)),
    )
    assert result == (20.0, 20.0, 100.0, 100.0)


def test_perspective_shaped_transform_is_refused_not_guessed() -> None:
    """No `TransformManifest.kind` value represents a homography/
    perspective correction — this proves the refusal itself, matching
    font_height.py's own documented stance that two-point calibration is
    not perspective correction."""
    bbox = BBox(left=10, top=10, right=50, bottom=50)

    class _FakeHomographyTransform:
        kind = "perspective"  # not a recognized TransformManifest.kind
        crop_offset_px = None
        scale = None

    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(),
        original_width_px=1000,
        original_height_px=800,
        transform=_FakeHomographyTransform(),  # type: ignore[arg-type]
    )
    assert result is None


def test_non_finite_bbox_refuses() -> None:
    bbox = BBox(left=float("nan"), top=0, right=10, bottom=10)
    result = map_bbox_to_original_pixels(
        bbox=bbox, unit="pixel", page=_page(), original_width_px=1000, original_height_px=800, transform=None
    )
    assert result is None


def test_inverted_bbox_refuses() -> None:
    bbox = BBox(left=100, top=100, right=10, bottom=10)  # x1<x0, y1<y0
    result = map_bbox_to_original_pixels(
        bbox=bbox, unit="pixel", page=_page(), original_width_px=1000, original_height_px=800, transform=None
    )
    assert result is None


def test_far_out_of_bounds_bbox_refuses() -> None:
    bbox = BBox(left=10, top=10, right=5000, bottom=5000)  # far exceeds the original image extent
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(width=10000.0, height=10000.0),
        original_width_px=100,
        original_height_px=100,
        transform=None,
    )
    assert result is None


def test_slightly_out_of_bounds_bbox_is_clamped_within_tolerance() -> None:
    bbox = BBox(left=-0.5, top=-0.5, right=100.5, bottom=100.5)
    result = map_bbox_to_original_pixels(
        bbox=bbox,
        unit="pixel",
        page=_page(width=100.0, height=100.0),
        original_width_px=100,
        original_height_px=100,
        transform=None,
        tolerance_px=1.5,
    )
    assert result == (0.0, 0.0, 100.0, 100.0)
