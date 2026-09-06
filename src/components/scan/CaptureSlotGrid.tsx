import {
  ACCEPTED_UPLOAD_FORMATS,
  CAPTURE_SLOT_ANGLES,
  type CaptureMode,
  type CaptureSlotAngle,
  type CaptureSlotState,
  type QualityFailureReason,
} from "@/types";

import { CaptureSlot } from "./CaptureSlot";

/**
 * CaptureSlotGrid — Front / Back / Side-PDP always visible together, plus the
 * optional 4th Additional-angle slot, per 03-scan-upload.md §2. Each slot is
 * fully independent (own status, own retake) — this component only lays them
 * out and surfaces the one "you're not done yet" prompt the wizard needs.
 */

export interface CaptureSlotGridProps {
  mode: CaptureMode | null;
  slots: Record<CaptureSlotAngle, CaptureSlotState>;
  onFileSelected: (angle: CaptureSlotAngle, file: File) => void;
  onRetake: (angle: CaptureSlotAngle) => void;
  requiredAnglesFilled: boolean;
  showIncompletePrompt: boolean;
  labels: {
    heading: string;
    incomplete: string;
    empty: string;
    browse: string;
    takePhoto: string;
    retake: string;
    remove: string;
    checking: string;
    passed: string;
    formatHint: string;
    cameraDenied: string;
    slot: Record<CaptureSlotAngle, { label: string; hint: string }>;
    qualityFailure: Record<QualityFailureReason, string>;
  };
}

const ACCEPT = ACCEPTED_UPLOAD_FORMATS.map((format) =>
  format === "PDF" ? "application/pdf" : `image/${format.toLowerCase()}`
).join(",");

export function CaptureSlotGrid({
  mode,
  slots,
  onFileSelected,
  onRetake,
  requiredAnglesFilled,
  showIncompletePrompt,
  labels,
}: CaptureSlotGridProps) {
  return (
    <section aria-labelledby="capture-slots-heading" className="lmcs-capture-slot-section">
      <h2 id="capture-slots-heading" className="ux4g-title-m-strong ux4g-mb-m">
        {labels.heading}
      </h2>

      {showIncompletePrompt && !requiredAnglesFilled ? (
        <p className="ux4g-upload-error-msg" role="alert">
          <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
          {labels.incomplete}
        </p>
      ) : null}

      <div className="lmcs-capture-slot-grid">
        {CAPTURE_SLOT_ANGLES.map((angle) => (
          <CaptureSlot
            key={angle}
            mode={mode}
            state={slots[angle]}
            accept={ACCEPT}
            onFileSelected={(file) => onFileSelected(angle, file)}
            onRetake={() => onRetake(angle)}
            labels={{
              label: labels.slot[angle].label,
              hint: labels.slot[angle].hint,
              empty: labels.empty,
              browse: labels.browse,
              takePhoto: labels.takePhoto,
              retake: labels.retake,
              remove: labels.remove,
              checking: labels.checking,
              passed: labels.passed,
              formatHint: labels.formatHint,
              cameraDenied: labels.cameraDenied,
              failureReason: (reason) => labels.qualityFailure[reason],
            }}
          />
        ))}
      </div>
    </section>
  );
}
