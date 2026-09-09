import { NextResponse } from "next/server";

import { resolveManufacturerScorecardForViewer } from "@/lib/server/scan-pipeline-store";

/**
 * GET /api/manufacturers/[id]/scorecard — one manufacturer's live scorecard.
 * Unknown directory ids 404; a known manufacturer whose records are wholly
 * outside the viewer's scope returns 403 without disclosing that distinction
 * to the client UI.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  /* Scopes this scorecard's numbers to the viewer's jurisdiction and role
   * (13 §4 plan) — see /api/records's own comment for the same convention. */
  const viewerId = new URL(request.url).searchParams.get("viewerId") ?? undefined;
  const { scorecard, blocked } = resolveManufacturerScorecardForViewer(id, viewerId);
  if (blocked) {
    return NextResponse.json(
      { error: "Manufacturer not found or outside your jurisdiction" },
      { status: 403 }
    );
  }
  if (!scorecard) {
    return NextResponse.json({ error: "Manufacturer not found" }, { status: 404 });
  }
  return NextResponse.json(scorecard);
}
