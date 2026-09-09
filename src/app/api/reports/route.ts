import { NextResponse } from "next/server";

import { listReports } from "@/lib/server/report-store";

/**
 * GET /api/reports — Download History (10 §2).
 *
 * A real Route Handler for the same reason as `/api/analytics` and
 * `/api/manufacturers`: the store is an in-memory Map that only exists in
 * this server process, so a client-side mock branch could never see a report
 * generated in another tab.
 */
export async function GET(request: Request) {
  const viewerId = new URL(request.url).searchParams.get("viewerId") ?? undefined;
  const reports = listReports(viewerId);
  return NextResponse.json({ reports, total: reports.length });
}
