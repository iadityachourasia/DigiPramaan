import { describe, expect, it } from "vitest";

import { computeWeightedProgress, TYPICAL_STAGE_DURATION_MS } from "@/lib/scan/estimatedDuration";
import { PIPELINE_STAGE_IDS, type PipelineStage } from "@/types";

function stage(id: (typeof PIPELINE_STAGE_IDS)[number], state: PipelineStage["state"]): PipelineStage {
  return { id, state };
}

function allPending(): PipelineStage[] {
  return PIPELINE_STAGE_IDS.map((id) => stage(id, "pending"));
}

describe("computeWeightedProgress", () => {
  it("is 0% and estimates the full typical duration when every stage is pending", () => {
    const { percent, estimatedRemainingMs } = computeWeightedProgress(allPending());
    const total = PIPELINE_STAGE_IDS.reduce((sum, id) => sum + TYPICAL_STAGE_DURATION_MS[id], 0);

    expect(percent).toBe(0);
    expect(estimatedRemainingMs).toBe(total);
  });

  it("is 100% and estimates zero remaining once every stage is terminal", () => {
    const stages = PIPELINE_STAGE_IDS.map((id) => stage(id, "completed"));
    const { percent, estimatedRemainingMs } = computeWeightedProgress(stages);

    expect(percent).toBe(100);
    expect(estimatedRemainingMs).toBe(0);
  });

  it("weights a slow stage (textExtraction) more heavily than a fast one (complianceScore)", () => {
    const stages = allPending();
    const withTextExtractionDone = stages.map((s) =>
      s.id === "textExtraction" ? stage(s.id, "completed") : s
    );
    const withComplianceScoreDone = stages.map((s) =>
      s.id === "complianceScore" ? stage(s.id, "completed") : s
    );

    const textDone = computeWeightedProgress(withTextExtractionDone);
    const scoreDone = computeWeightedProgress(withComplianceScoreDone);

    expect(textDone.percent).toBeGreaterThan(scoreDone.percent);
  });

  it("counts an in-progress stage as half-done", () => {
    const stages = allPending().map((s) =>
      s.id === "structuring" ? stage(s.id, "in_progress") : s
    );
    const { estimatedRemainingMs } = computeWeightedProgress(stages);
    const total = PIPELINE_STAGE_IDS.reduce((sum, id) => sum + TYPICAL_STAGE_DURATION_MS[id], 0);

    expect(estimatedRemainingMs).toBe(total - TYPICAL_STAGE_DURATION_MS.structuring / 2);
  });

  it("treats a failed stage as terminal (done), not still-remaining", () => {
    const stages = allPending().map((s) =>
      s.id === "textExtraction" ? stage(s.id, "failed") : s
    );
    const { estimatedRemainingMs } = computeWeightedProgress(stages);
    const total = PIPELINE_STAGE_IDS.reduce((sum, id) => sum + TYPICAL_STAGE_DURATION_MS[id], 0);

    expect(estimatedRemainingMs).toBe(total - TYPICAL_STAGE_DURATION_MS.textExtraction);
  });
});
