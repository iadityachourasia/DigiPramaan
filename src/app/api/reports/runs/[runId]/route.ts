import { NextResponse } from "next/server";

import { getReportRun } from "@/lib/server/report-store";

/**
 * GET /api/reports/runs/[runId] — polls one generation run.
 *
 * Progress is derived from elapsed time on read (see `report-store.ts`), so a
 * poll after the tab was closed fast-forwards correctly rather than resuming
 * a timer that no longer exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const run = getReportRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Report run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}
