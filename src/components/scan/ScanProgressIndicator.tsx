"use client";

import type { CSSProperties } from "react";

import { computeWeightedProgress } from "@/lib/scan/estimatedDuration";
import type { PipelineStage } from "@/types";

export interface ScanProgressIndicatorProps {
  stages: readonly PipelineStage[];
  /** The run has reached a terminal state (ready or failed) — the row
   * disappears entirely rather than estimating a run that's already done. */
  terminal: boolean;
  labels: {
    progressLabel: string;
    estimatedRemaining: (seconds: number) => string;
    estimatedHint: string;
  };
}

/**
 * ScanProgressIndicator — the SLA Progress Indicator of the Application
 * Tracker composition. One real `ux4g-sla-linear ux4g-sla-linear-rounded`
 * instance (confirmed markup shape from `MobileHandoffPanel.tsx`'s existing,
 * working use of this same recipe). Percentage is duration-weighted, not a
 * naive stage-count ratio — see `estimatedDuration.ts`. The remaining-time
 * label always carries an "(estimated)" qualifier; it is a heuristic over
 * typical stage durations, never a real measurement.
 */
export function ScanProgressIndicator({ stages, terminal, labels }: ScanProgressIndicatorProps) {
  if (terminal) return null;

  const { percent, estimatedRemainingMs } = computeWeightedProgress(stages);
  const estimatedRemainingSeconds = Math.round(estimatedRemainingMs / 1000);

  return (
    <div
      className="ux4g-sla-linear ux4g-sla-linear-rounded"
      style={{ "--ux4g-sla-progress": percent } as CSSProperties}
    >
      <span className="ux4g-sla-linear-leading" aria-hidden="true">
        <span className="ux4g-icon-outlined">insights</span>
      </span>
      <div className="ux4g-sla-linear-body">
        <div className="ux4g-sla-linear-head">
          <div className="ux4g-sla-linear-title-wrap">
            <p className="ux4g-sla-linear-title">{labels.progressLabel}</p>
          </div>
          <p className="ux4g-sla-linear-value">{percent}%</p>
        </div>
        <div className="ux4g-sla-linear-track">
          <div className="ux4g-sla-linear-fill" />
        </div>
        <div className="ux4g-sla-linear-foot">
          <p className="ux4g-sla-linear-hint" title={labels.estimatedHint}>
            {labels.estimatedRemaining(estimatedRemainingSeconds)}
          </p>
        </div>
      </div>
    </div>
  );
}
