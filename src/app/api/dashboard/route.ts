import { NextResponse } from "next/server";

import { computeDashboardData } from "@/lib/server/scan-pipeline-store";

/** GET /api/dashboard — scoped, live data for every Dashboard widget. */
export async function GET(request: Request) {
  const viewerId = new URL(request.url).searchParams.get("viewerId") ?? undefined;
  return NextResponse.json(computeDashboardData(viewerId));
}
