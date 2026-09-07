import { NextResponse } from "next/server";

import { computeManufacturerScorecards } from "@/lib/server/scan-pipeline-store";

/**
 * GET /api/manufacturers — the live-aware read path for the Manufacturer
 * Compliance Scorecard list (page 9). A real Route Handler for the same
 * reason as `/api/analytics`: the aggregation reads
 * `scan-pipeline-store.ts`'s in-memory `runs` Map, which only exists in
 * this server process, so a client-side mock branch could never see a
 * manufacturer scanned through the live pipeline.
 */
export async function GET(request: Request) {
  /* Scopes every scorecard's numbers to the viewer's jurisdiction and role
   * (13 §4 plan) — see /api/records's own comment for the same convention. */
  const viewerId = new URL(request.url).searchParams.get("viewerId") ?? undefined;
  const scorecards = computeManufacturerScorecards(viewerId);
  return NextResponse.json({ scorecards, total: scorecards.length });
}
