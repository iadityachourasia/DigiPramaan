import { NextResponse } from "next/server";

import {
  computeManufacturerScorecard,
  flagManufacturerForEnforcement,
} from "@/lib/server/scan-pipeline-store";

interface FlagManufacturerBody {
  userId?: unknown;
}

/**
 * POST /api/manufacturers/[id]/flag-enforcement — manufacturer-scoped Flag
 * for Enforcement (09 §4), Enforcement Officer/Admin only per
 * 00-README.md §C. No server-side role re-check — the page gates the
 * button on `enforcement.flag` and this endpoint trusts that gate, the same
 * pattern every other mutation in this mock backend already follows.
 *
 * Takes the manufacturer id and resolves the name itself, so the client
 * can't flag an arbitrary name string that never appears in the list.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as FlagManufacturerBody;
  const userId = typeof body.userId === "string" ? body.userId : null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const scorecard = computeManufacturerScorecard(id);
  if (!scorecard) {
    return NextResponse.json({ error: "Manufacturer not found" }, { status: 404 });
  }

  return NextResponse.json(flagManufacturerForEnforcement(scorecard.summary.name, userId));
}
