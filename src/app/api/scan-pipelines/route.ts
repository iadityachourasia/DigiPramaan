import { NextResponse } from "next/server";

import { createPipelineRun } from "@/lib/server/scan-pipeline-store";
import {
  PIPELINE_STAGE_IDS,
  type CaptureSlotAngle,
  type PipelineStageId,
  type ScanMetadata,
} from "@/types";

interface CreateBody {
  scanId?: unknown;
  metadata?: unknown;
  images?: unknown;
  scannedByUserId?: unknown;
  forceFailStage?: unknown;
  fallbackOverride?: unknown;
}

/** POST /api/scan-pipelines — create a Processing Pipeline run (03-scan-upload.md §2 Step 5). */
export async function POST(request: Request) {
  const body = (await request.json()) as CreateBody;

  const scanId = typeof body.scanId === "string" ? body.scanId : null;
  const scannedByUserId = typeof body.scannedByUserId === "string" ? body.scannedByUserId : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
  const images = Array.isArray(body.images) ? body.images : [];

  if (!scanId || !scannedByUserId || !metadata) {
    return NextResponse.json(
      { error: "scanId, metadata and scannedByUserId are all required" },
      { status: 400 }
    );
  }

  const forceFailStage = PIPELINE_STAGE_IDS.includes(body.forceFailStage as PipelineStageId)
    ? (body.forceFailStage as PipelineStageId)
    : undefined;
  const fallbackOverride =
    body.fallbackOverride === "used" || body.fallbackOverride === "skipped"
      ? body.fallbackOverride
      : undefined;

  const run = createPipelineRun({
    scanId,
    scannedByUserId,
    metadata: metadata as ScanMetadata,
    images: images as Array<{ angle: CaptureSlotAngle; fileName: string; url: string; sizeBytes: number }>,
    ...(forceFailStage ? { forceFailStage } : {}),
    ...(fallbackOverride ? { fallbackOverride } : {}),
  });

  return NextResponse.json(run, { status: 201 });
}
