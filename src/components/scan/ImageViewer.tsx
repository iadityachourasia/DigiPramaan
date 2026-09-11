"use client";

import { useRef, useState } from "react";

import type { CaptureSlotAngle, UploadedImage } from "@/types";

/**
 * ImageViewer — the left panel of the two-panel layout
 * (04-extraction-verification.md §2): the source image, zoomable, switchable
 * between the three captured angles. Plain `ux4g-btn` toggles for the angle
 * switcher rather than a tab component — no `ux4g-tab-*` classes exist in
 * the compiled stylesheet (confirmed by grep) for three short, static
 * options.
 *
 * Phase 6: an OPTIONAL calibration mode (`calibrationActive`) for Rule 7's
 * manual two-point calibration. Absent (the default), the viewer behaves
 * exactly as before — click zooms. When active, the zoom-toggle is disabled
 * and clicks are instead collected as the two points spanning a known
 * physical dimension, converted from on-screen to the image's NATURAL pixel
 * resolution (the same coordinate space PaddleOCR's bboxes already live in)
 * via `naturalWidth`/`getBoundingClientRect()` ratio math.
 *
 * Phase 7: an INDEPENDENT optional `highlightBbox` — an outline drawn over
 * the normal (non-calibration) zoom branch using the exact same
 * natural-pixel-to-percentage math, so a checklist row's cited OCR region
 * can be shown on the correct image. `calibrationActive` and
 * `highlightBbox` are mutually exclusive by construction (calibration only
 * ever comes from the Extraction page, highlighting only from Record
 * Detail) — the calibration branch below is untouched.
 */

export interface ImagePoint {
  x: number;
  y: number;
}

export interface ImageViewerProps {
  images: readonly UploadedImage[];
  activeAngle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">;
  onActiveAngleChange: (angle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">) => void;
  labels: {
    angle: (angle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">) => string;
    zoomIn: string;
    zoomOut: string;
  };
  /** Phase 6 — when true, clicks collect calibration points instead of zooming. */
  calibrationActive?: boolean;
  /** Called once two points have been collected, in natural image pixel coordinates. */
  onCalibrationPoints?: (points: [ImagePoint, ImagePoint]) => void;
  /** Bump to clear any collected-but-unsubmitted calibration points (e.g. after submit). */
  calibrationResetToken?: number;
  /** Phase 7 — natural-pixel [x0,y0,x1,y1] to outline on the active image. Ignored while calibrating. */
  highlightBbox?: [number, number, number, number];
}

const ANGLES: readonly Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">[] = [
  "front",
  "back",
  "side_pdp",
];

export function ImageViewer({
  images,
  activeAngle,
  onActiveAngleChange,
  labels,
  calibrationActive = false,
  onCalibrationPoints,
  calibrationResetToken,
  highlightBbox,
}: ImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [points, setPoints] = useState<ImagePoint[]>([]);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const active = images.find((img) => img.angle === activeAngle) ?? images[0];

  /* Reset collected points when the reset token bumps or the angle changes
   * — "adjusting state during render" (react.dev's own recommended
   * pattern for this), not a setState-in-effect cascading render. */
  const resetKey = `${calibrationResetToken ?? 0}:${activeAngle}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPoints([]);
  }

  function handleCalibrationClick(event: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    if (!img || points.length >= 2) return;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const point: ImagePoint = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
    const next = [...points, point];
    setPoints(next);
    if (next.length === 2) {
      onCalibrationPoints?.([next[0]!, next[1]!]);
    }
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    setNaturalSize({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });
  }

  const highlightStyle =
    highlightBbox && naturalSize
      ? {
          left: `${(highlightBbox[0] / naturalSize.width) * 100}%`,
          top: `${(highlightBbox[1] / naturalSize.height) * 100}%`,
          width: `${((highlightBbox[2] - highlightBbox[0]) / naturalSize.width) * 100}%`,
          height: `${((highlightBbox[3] - highlightBbox[1]) / naturalSize.height) * 100}%`,
        }
      : null;

  return (
    <div className="lmcs-image-viewer">
      <div className="lmcs-image-viewer-tabs" role="tablist">
        {ANGLES.map((angle) => (
          <button
            key={angle}
            type="button"
            role="tab"
            aria-selected={angle === activeAngle}
            className={`ux4g-btn ux4g-btn-sm ${
              angle === activeAngle ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"
            }`}
            onClick={() => {
              onActiveAngleChange(angle);
              setZoomed(false);
            }}
          >
            {labels.angle(angle)}
          </button>
        ))}
      </div>

      <div className={`lmcs-image-viewer-frame${zoomed ? " lmcs-image-viewer-zoomed" : ""}`}>
        {active ? (
          calibrationActive ? (
            <div className="lmcs-image-viewer-calibration-frame">
              {/*
                A pointer-precise "click two points on this image" affordance has no
                meaningful keyboard equivalent — the interaction IS the pointer
                coordinate. Justified, scoped eslint-disable rather than a fake
                keyboard handler that wouldn't actually let a keyboard user calibrate.
              */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions, @next/next/no-img-element -- see comment above; placeholder/object-URL asset, not one next/image is meant to optimize. */}
              <img
                ref={imgRef}
                src={active.url}
                alt={active.altText}
                onClick={handleCalibrationClick}
                onLoad={handleImageLoad}
                style={{ cursor: points.length < 2 ? "crosshair" : "default" }}
              />
              {naturalSize
                ? points.map((point, index) => {
                    const leftPct = (point.x / naturalSize.width) * 100;
                    const topPct = (point.y / naturalSize.height) * 100;
                    return (
                      <span
                        key={index}
                        className="lmcs-image-viewer-calibration-marker"
                        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                        aria-hidden="true"
                      />
                    );
                  })
                : null}
            </div>
          ) : (
            <button
              type="button"
              className="lmcs-image-viewer-zoom-btn"
              onClick={() => setZoomed((v) => !v)}
              aria-label={zoomed ? labels.zoomOut : labels.zoomIn}
            >
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, @next/next/no-img-element -- onLoad is a lifecycle event (natural image dimensions become known), not a user interaction; placeholder/object-URL asset, not one next/image is meant to optimize. */}
              <img src={active.url} alt={active.altText} onLoad={handleImageLoad} />
              {highlightStyle ? (
                <span className="lmcs-image-viewer-highlight-box" style={highlightStyle} aria-hidden="true" />
              ) : null}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
