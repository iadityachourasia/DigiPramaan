"use client";

import { useState } from "react";

import type { CaptureSlotAngle, UploadedImage } from "@/types";

/**
 * ImageViewer — the left panel of the two-panel layout
 * (04-extraction-verification.md §2): the source image, zoomable, switchable
 * between the three captured angles. Plain `ux4g-btn` toggles for the angle
 * switcher rather than a tab component — no `ux4g-tab-*` classes exist in
 * the compiled stylesheet (confirmed by grep) for three short, static
 * options.
 */

export interface ImageViewerProps {
  images: readonly UploadedImage[];
  activeAngle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">;
  onActiveAngleChange: (angle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">) => void;
  labels: {
    angle: (angle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">) => string;
    zoomIn: string;
    zoomOut: string;
  };
}

const ANGLES: readonly Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">[] = [
  "front",
  "back",
  "side_pdp",
];

export function ImageViewer({ images, activeAngle, onActiveAngleChange, labels }: ImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const active = images.find((img) => img.angle === activeAngle) ?? images[0];

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
          <button
            type="button"
            className="lmcs-image-viewer-zoom-btn"
            onClick={() => setZoomed((v) => !v)}
            aria-label={zoomed ? labels.zoomOut : labels.zoomIn}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- placeholder/object-URL asset, not one next/image is meant to optimize. */}
            <img src={active.url} alt={active.altText} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
