import type { ConfidenceBand } from "@/types";

/**
 * ConfidenceBadge — per-field confidence band pill for Declaration
 * Extraction & Verification (04 §3).
 *
 * Mirrors `StatusBadge.tsx`'s exact structure (tonal tag + icon + text, so
 * nothing depends on colour alone) rather than reusing that component
 * directly — `StatusBadge` is typed to `ComplianceStatus`, and forcing a
 * `ConfidenceBand` through it would need an awkward union that no other
 * caller needs.
 */

const BAND_CLASS: Record<ConfidenceBand, string> = {
  High: "ux4g-tag-tonal-success",
  Medium: "ux4g-tag-tonal-warning",
  Low: "ux4g-tag-tonal-error",
};

/*
 * Reused from icons already confirmed rendering correctly elsewhere in this
 * build (CaptureSlot/StatusBadge/PipelineTracker) rather than a fresh guess
 * at the UX4G icon font's ligature subset — see CLAUDE.md's own warning that
 * ligature existence has no static check and must be confirmed live.
 */
const BAND_ICON: Record<ConfidenceBand, string> = {
  High: "check_circle",
  Medium: "flag",
  Low: "error",
};

export interface ConfidenceBadgeProps {
  band: ConfidenceBand;
  /** 0–100. Rendered alongside the band per 04 §3. */
  percentage: number;
  /** The translated band label — pass t(`vocabulary.confidenceBand.${band}`). */
  label: string;
}

export function ConfidenceBadge({ band, percentage, label }: ConfidenceBadgeProps) {
  return (
    <span className={`${BAND_CLASS[band]} ux4g-tag-s lmcs-confidence-badge`}>
      <span className="ux4g-icon-outlined" aria-hidden="true">
        {BAND_ICON[band]}
      </span>
      <span className="ux4g-label-s-default">
        {label} · {percentage}%
      </span>
    </span>
  );
}
