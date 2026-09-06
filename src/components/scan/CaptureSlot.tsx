"use client";

import { motion } from "framer-motion";
import type { ChangeEvent } from "react";
import { useId, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks";
import type { CaptureMode, CaptureSlotState, QualityFailureReason } from "@/types";

import { CameraPreview } from "./CameraPreview";

/**
 * CaptureSlot — one named capture slot (Front / Back / Side-PDP / Additional).
 *
 * Built from the REAL `ux4g-upload-*` classes confirmed against the compiled
 * `ux4g-web-components@2.0.1` stylesheet — not the design-canvas `FileUpload`
 * reference, whose class names (`ux4g-upload__zone`) do not exist in the real
 * package. The real component ships a state machine that maps onto this
 * slot's own almost exactly:
 *
 *   ux4g-upload-state-default   → empty, dashed primary border at rest
 *   ux4g-upload-state-selecting → capturing (file picker open / camera live)
 *   ux4g-upload-state-scanning  → checking (quality gate in flight)
 *   ux4g-upload-state-uploaded  → passed
 *   ux4g-upload-state-error     → failed
 *
 * One real gap: the package's file-row is icon-only, with no image-preview
 * class anywhere in the compiled CSS (confirmed by grep). The passed state's
 * thumbnail is therefore a plain `next/image`, the same pattern already
 * established by RecentScansTable — reused, not invented.
 */

export interface CaptureSlotProps {
  mode: CaptureMode | null;
  state: CaptureSlotState;
  labels: {
    label: string;
    hint: string;
    empty: string;
    browse: string;
    takePhoto: string;
    retake: string;
    remove: string;
    checking: string;
    passed: string;
    formatHint: string;
    cameraDenied: string;
    failureReason: (reason: QualityFailureReason) => string;
  };
  accept: string;
  onFileSelected: (file: File) => void;
  onRetake: () => void;
}

const STATE_CLASS: Record<CaptureSlotState["status"], string> = {
  empty: "ux4g-upload-state-default",
  capturing: "ux4g-upload-state-selecting",
  checking: "ux4g-upload-state-scanning",
  passed: "ux4g-upload-state-uploaded",
  failed: "ux4g-upload-state-error",
};

export function CaptureSlot({
  mode,
  state,
  labels,
  accept,
  onFileSelected,
  onRetake,
}: CaptureSlotProps) {
  const inputId = useId();
  const [capturing, setCapturing] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  /*
   * The one deliberate motion moment for this whole page (see the design
   * plan): a slot settling into its filled state once an image clears the
   * quality gate. Position/opacity only, matching HomePipeline's existing
   * precedent, and skipped outright under prefers-reduced-motion rather than
   * shortened — the content is already fully present without it.
   */
  const passedReveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.28, ease: "easeOut" as const },
      };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFileSelected(file);
  };

  const handleCameraCapture = (file: File) => {
    setCapturing(false);
    onFileSelected(file);
  };

  return (
    <div className={`ux4g-upload ${STATE_CLASS[state.status]} lmcs-capture-slot`}>
      <div className="lmcs-capture-slot-heading">
        <span className="ux4g-title-s-strong">{labels.label}</span>
        <span className="ux4g-label-s-default ux4g-text-neutral-secondary">{labels.hint}</span>
      </div>

      <div className="ux4g-upload-panel">
        {state.status === "empty" || state.status === "failed" ? (
          capturing && mode === "camera" ? (
            <CameraPreview
              captureLabel={labels.takePhoto}
              cameraDeniedMessage={labels.cameraDenied}
              onCapture={handleCameraCapture}
            />
          ) : (
            <div className="ux4g-upload-content">
              <div className="ux4g-upload-option">
                <span className="ux4g-upload-icon-wrap" aria-hidden="true">
                  <span className="ux4g-icon-outlined ux4g-upload-icon">
                    {mode === "camera" ? "photo_camera" : "upload_file"}
                  </span>
                </span>
                <div className="ux4g-upload-titleblock">
                  <p className="ux4g-body-s-default">{labels.empty}</p>
                  <p className="ux4g-upload-hint">{labels.formatHint}</p>
                </div>
              </div>

              {state.status === "failed" && state.failureReason ? (
                <p className="ux4g-upload-error-msg" role="alert">
                  <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
                  {labels.failureReason(state.failureReason)}
                </p>
              ) : null}

              <div className="ux4g-upload-actions">
                {mode === "camera" ? (
                  <button
                    type="button"
                    className="ux4g-btn ux4g-btn-primary ux4g-upload-btn"
                    onClick={() => setCapturing(true)}
                  >
                    {labels.takePhoto}
                  </button>
                ) : (
                  <>
                    <label htmlFor={inputId} className="ux4g-btn ux4g-btn-primary ux4g-upload-btn">
                      {state.status === "failed" ? labels.retake : labels.browse}
                    </label>
                    <input
                      id={inputId}
                      type="file"
                      accept={accept}
                      aria-label={state.status === "failed" ? labels.retake : labels.browse}
                      className="ux4g-sr-only"
                      onChange={handleFileInput}
                    />
                  </>
                )}
              </div>
            </div>
          )
        ) : state.status === "checking" ? (
          <div className="ux4g-upload-content" role="status">
            <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
            <p className="ux4g-body-s-default">{labels.checking}</p>
          </div>
        ) : (
          <motion.div
            className="ux4g-upload-file-item lmcs-capture-slot-file"
            {...passedReveal}
          >
            <span className="ux4g-upload-file-leading lmcs-capture-slot-thumb">
              {state.image ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a client-generated blob: object URL, not a remote/static asset next/image is meant to optimize. */
                <img src={state.image.url} alt={state.image.altText} width={64} height={64} />
              ) : null}
            </span>
            <span className="ux4g-upload-file-copy">
              <span className="ux4g-upload-file-name">{state.image?.fileName}</span>
              <span className="ux4g-upload-file-description">{labels.passed}</span>
            </span>
            <span className="ux4g-upload-file-statusbox ux4g-upload-file-status" aria-hidden="true">
              <span className="ux4g-icon-outlined">check</span>
            </span>
            <button
              type="button"
              className="ux4g-upload-file-retry"
              onClick={onRetake}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">replay</span>
              {labels.retake}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
