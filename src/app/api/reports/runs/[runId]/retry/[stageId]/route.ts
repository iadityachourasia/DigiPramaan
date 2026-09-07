import { NextResponse } from "next/server";

import { retryReportStage } from "@/lib/server/report-store";
import { REPORT_STAGE_IDS, type ReportStageId } from "@/types";

/**
 * POST /api/reports/runs/[runId]/retry/[stageId] — retries one failed stage
 * (10 §4's "Generation failure — clear error with Retry, filters/scope
 * preserved"). The scope lives on the run, so retrying resumes rather than
 * asking the user to rebuild their selection.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string; stageId: string }> }
) {
  const { runId, stageId } = await params;

  if (!REPORT_STAGE_IDS.includes(stageId as ReportStageId)) {
    return NextResponse.json({ error: "Unknown report stage" }, { status: 400 });
  }

  const run = retryReportStage(runId, stageId as ReportStageId);
  if (!run) {
    return NextResponse.json(
      { error: "Report run not found, or that stage is not failed" },
      { status: 404 }
    );
  }
  return NextResponse.json(run);
}
