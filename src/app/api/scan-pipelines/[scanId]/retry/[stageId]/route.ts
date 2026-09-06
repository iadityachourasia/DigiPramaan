import { NextResponse } from "next/server";

import { retryPipelineStage } from "@/lib/server/scan-pipeline-store";
import { PIPELINE_STAGE_IDS, type PipelineStageId } from "@/types";

/**
 * POST /api/scan-pipelines/[scanId]/retry/[stageId] — stage-scoped retry
 * (03-scan-upload.md §2: "a specific error and a stage-scoped retry, doesn't
 * restart earlier completed stages").
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ scanId: string; stageId: string }> }
) {
  const { scanId, stageId } = await params;

  if (!PIPELINE_STAGE_IDS.includes(stageId as PipelineStageId)) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  }

  const run = retryPipelineStage(scanId, stageId as PipelineStageId);
  if (!run) {
    return NextResponse.json(
      { error: "Pipeline run not found, or that stage is not currently failed" },
      { status: 404 }
    );
  }
  return NextResponse.json(run);
}
