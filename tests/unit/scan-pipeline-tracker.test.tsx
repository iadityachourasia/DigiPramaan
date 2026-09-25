import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanPipelineTracker } from "@/components/scan/ScanPipelineTracker";
import { PIPELINE_STAGE_IDS, type PipelineStage, type PipelineStageId } from "@/types";

const STAGE_ICON: Record<PipelineStageId, string> = {
  uploading: "cloud_upload",
  qualityCheck: "verified",
  textExtraction: "document_scanner",
  fallbackExtraction: "auto_awesome",
  barcodeDetection: "barcode_scanner",
  structuring: "schema",
  ruleEngine: "gavel",
  complianceScore: "insights",
  readyForVerification: "task_alt",
};

const labels = {
  stageLabel: (stageId: PipelineStageId) => stageId,
  skipped: "Skipped",
  retry: "Retry",
  inProgress: "In progress",
  pending: "Not started",
  completed: "Completed",
  failed: "Failed",
};

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe("ScanPipelineTracker", () => {
  beforeEach(() => {
    mockMatchMedia(true); // default: tablet-or-above -> horizontal
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the correct stage-specific icon for every pending stage", () => {
    const stages: PipelineStage[] = PIPELINE_STAGE_IDS.map((id) => ({ id, state: "pending" }));
    render(<ScanPipelineTracker stages={stages} onRetry={() => {}} labels={labels} />);

    for (const id of PIPELINE_STAGE_IDS) {
      expect(screen.getByText(STAGE_ICON[id])).toBeInTheDocument();
    }
  });

  it("renders a spinner for the in-progress stage and an error icon for a failed stage", () => {
    const stages: PipelineStage[] = PIPELINE_STAGE_IDS.map((id, i) => ({
      id,
      state: i === 0 ? "in_progress" : i === 1 ? "failed" : "pending",
      ...(i === 1 ? { failureReason: "boom" } : {}),
    }));
    const { container } = render(
      <ScanPipelineTracker stages={stages} onRetry={() => {}} labels={labels} />
    );

    expect(container.querySelector(".ux4g-spinner")).not.toBeNull();
    expect(screen.getAllByText("error").length).toBeGreaterThan(0);
  });

  it("orients horizontally at tablet-or-above widths and vertically below it", () => {
    const stages: PipelineStage[] = PIPELINE_STAGE_IDS.map((id) => ({ id, state: "pending" }));

    mockMatchMedia(true);
    const { container: wide } = render(
      <ScanPipelineTracker stages={stages} onRetry={() => {}} labels={labels} />
    );
    expect(wide.querySelector(".ux4g-status-pipeline-horizontal")).not.toBeNull();

    mockMatchMedia(false);
    const { container: narrow } = render(
      <ScanPipelineTracker stages={stages} onRetry={() => {}} labels={labels} />
    );
    expect(narrow.querySelector(".ux4g-status-pipeline-vertical")).not.toBeNull();
  });
});
