import { NextResponse } from "next/server";

import { getPipelineRun } from "@/lib/server/scan-pipeline-store";

/** GET /api/scan-pipelines/[scanId] — polled by the tracker page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const run = getPipelineRun(scanId);

  if (!run) {
    return NextResponse.json({ error: "Pipeline run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}
