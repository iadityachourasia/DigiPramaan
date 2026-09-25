import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScanProgressIndicator } from "@/components/scan/ScanProgressIndicator";
import { PIPELINE_STAGE_IDS, type PipelineStage } from "@/types";

function stages(overrideState: PipelineStage["state"] = "pending"): PipelineStage[] {
  return PIPELINE_STAGE_IDS.map((id) => ({ id, state: overrideState }));
}

const labels = {
  progressLabel: "Overall progress",
  estimatedRemaining: (seconds: number) => `~${seconds}s remaining (estimated)`,
  estimatedHint: "A typical-case estimate.",
};

describe("ScanProgressIndicator", () => {
  it("never omits the (estimated) qualifier on the remaining-time label", () => {
    render(<ScanProgressIndicator stages={stages("pending")} terminal={false} labels={labels} />);
    expect(screen.getByText(/\(estimated\)/)).toBeInTheDocument();
  });

  it("reflects the weighted percentage, not a naive stage-count ratio", () => {
    const mixed = stages("pending").map((s) =>
      s.id === "textExtraction" ? { ...s, state: "completed" as const } : s
    );
    render(<ScanProgressIndicator stages={mixed} terminal={false} labels={labels} />);

    // 1 of 9 stages done by naive count would be ~11% — textExtraction's real
    // weight is much higher than that, proving the naive ratio isn't what renders.
    const value = screen.getByText(/%$/);
    const percent = Number(value.textContent?.replace("%", ""));
    expect(percent).toBeGreaterThan(20);
  });

  it("renders nothing once the run reaches a terminal state", () => {
    const { container } = render(
      <ScanProgressIndicator stages={stages("completed")} terminal={true} labels={labels} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
