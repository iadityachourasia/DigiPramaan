import { useId } from "react";

import type { CaptureMode } from "@/types";

/**
 * ModeSelectCards — Step 0 of the Scan Capture Wizard (03-scan-upload.md §2).
 *
 * Three cards, not a dropdown — the spec is explicit this is the first real
 * decision in the flow and should read as prominent. Built from `ux4g-card
 * ux4g-card-outline`, the same primitive every card on this product already
 * uses; the selected state is `.lmcs-mode-card.is-selected` in layout.css,
 * which only assigns confirmed real tokens (`--ux4g-border-color-primary-strong`,
 * `--ux4g-bg-primary`) — the same pair `.ux4g-upload-panel`'s own active state
 * uses, not an invented "selected card" treatment.
 *
 * Each card is a real `<button>`, not a link — picking a mode changes what
 * renders on this same page, it never navigates.
 */

export interface ModeSelectCardsProps {
  value: CaptureMode | null;
  onChange: (mode: CaptureMode) => void;
  labels: {
    heading: string;
    device: { title: string; body: string };
    camera: { title: string; body: string };
    mobile: { title: string; body: string };
  };
}

const MODE_ICON: Record<CaptureMode, string> = {
  device: "upload_file",
  camera: "photo_camera",
  mobile: "qr_code_scanner",
};

export function ModeSelectCards({ value, onChange, labels }: ModeSelectCardsProps) {
  const modes: CaptureMode[] = ["device", "camera", "mobile"];
  const descriptionIdPrefix = useId();

  return (
    <div role="radiogroup" aria-label={labels.heading} className="lmcs-mode-card-grid">
      {modes.map((mode) => {
        const copy = labels[mode];
        const selected = value === mode;
        const descriptionId = `${descriptionIdPrefix}-${mode}`;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={copy.title}
            aria-describedby={descriptionId}
            className={`ux4g-card ux4g-card-outline lmcs-mode-card${selected ? " is-selected" : ""}`}
            onClick={() => onChange(mode)}
          >
            <div className="ux4g-card-body lmcs-mode-card-body">
              <span className="ux4g-icon-outlined lmcs-mode-card-icon" aria-hidden="true">
                {MODE_ICON[mode]}
              </span>
              <span className="ux4g-title-m-strong">{copy.title}</span>
              <span
                id={descriptionId}
                className="ux4g-body-s-default ux4g-text-neutral-secondary"
              >
                {copy.body}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
