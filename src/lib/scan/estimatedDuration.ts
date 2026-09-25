import { PIPELINE_STAGE_IDS, type PipelineStage, type PipelineStageId } from "@/types";

/**
 * Typical real-world duration per stage, in milliseconds — used only to
 * *weight* the progress bar and derive a rough "time remaining" estimate.
 * Seeded from the mock store's `STAGE_DURATION_MS` proportions
 * (scan-pipeline-store.ts) but scaled up roughly an order of magnitude,
 * since those mock numbers exist purely for demo responsiveness, not real
 * backend timing. Placeholder until enough real `startedAt`/`completedAt`
 * samples exist to replace this with a measured average per stage.
 */
export const TYPICAL_STAGE_DURATION_MS: Record<PipelineStageId, number> = {
  uploading: 2000,
  qualityCheck: 0,
  textExtraction: 9000,
  fallbackExtraction: 7000,
  barcodeDetection: 2000,
  structuring: 7000,
  ruleEngine: 3000,
  complianceScore: 1500,
  readyForVerification: 0,
};

const TOTAL_TYPICAL_DURATION_MS = PIPELINE_STAGE_IDS.reduce(
  (sum, id) => sum + TYPICAL_STAGE_DURATION_MS[id],
  0
);

export interface WeightedProgress {
  /** 0-100, duration-weighted — a slow stage (e.g. textExtraction) counts
   * for more of the bar than a near-instant one (e.g. complianceScore). */
  percent: number;
  /** Estimated milliseconds remaining, based on typical per-stage duration
   * for every stage not yet completed/skipped/failed. Always a heuristic —
   * never a real measurement — and only meaningful while the run is active. */
  estimatedRemainingMs: number;
}

/**
 * Duration-weighted progress across the pipeline. A stage counts as fully
 * "done" once it's completed/skipped/failed; an in-progress stage counts as
 * half-done (there's no real sub-stage signal to do better); a pending stage
 * counts as zero.
 */
export function computeWeightedProgress(stages: readonly PipelineStage[]): WeightedProgress {
  let doneMs = 0;
  let remainingMs = 0;

  for (const stage of stages) {
    const typical = TYPICAL_STAGE_DURATION_MS[stage.id];
    if (stage.state === "completed" || stage.state === "skipped" || stage.state === "failed") {
      doneMs += typical;
    } else if (stage.state === "in_progress") {
      doneMs += typical / 2;
      remainingMs += typical / 2;
    } else {
      remainingMs += typical;
    }
  }

  const percent = TOTAL_TYPICAL_DURATION_MS === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round((doneMs / TOTAL_TYPICAL_DURATION_MS) * 100)));

  return { percent, estimatedRemainingMs: Math.round(remainingMs) };
}
