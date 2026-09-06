import { NextResponse } from "next/server";

import { computeAnalyticsSummary } from "@/lib/server/scan-pipeline-store";

/**
 * GET /api/analytics — the live-aware read path for Analytics & Violation
 * Trends (page 7). A real Route Handler, not a client-side mock branch —
 * `computeAnalyticsSummary()` reads `scan-pipeline-store.ts`'s in-memory
 * `runs` Map, which only exists in this server process (same reason page
 * 5/6's record reads/writes go through `/api/records/...`).
 */
export async function GET() {
  return NextResponse.json(computeAnalyticsSummary());
}
