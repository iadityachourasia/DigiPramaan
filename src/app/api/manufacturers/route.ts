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
export async function GET() {
  const scorecards = computeManufacturerScorecards();
  return NextResponse.json({ scorecards, total: scorecards.length });
}
