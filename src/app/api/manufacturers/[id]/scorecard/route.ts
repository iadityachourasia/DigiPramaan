import { NextResponse } from "next/server";

import { computeManufacturerScorecard } from "@/lib/server/scan-pipeline-store";

/**
 * GET /api/manufacturers/[id]/scorecard — one manufacturer's live scorecard.
 * 404s on an unknown id rather than returning an empty scorecard, so the
 * Dashboard's repeat-violation alert deep link either lands on real data or
 * fails honestly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  /* Scopes this scorecard's numbers to the viewer's jurisdiction and role
   * (13 §4 plan) — see /api/records's own comment for the same convention. */
  const viewerId = new URL(request.url).searchParams.get("viewerId") ?? undefined;
  const scorecard = computeManufacturerScorecard(id, viewerId);
  if (!scorecard) {
    return NextResponse.json({ error: "Manufacturer not found" }, { status: 404 });
  }
  return NextResponse.json(scorecard);
}
