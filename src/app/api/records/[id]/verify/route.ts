import { NextResponse } from "next/server";

import { verifyRecord } from "@/lib/server/scan-pipeline-store";

interface VerifyBody {
  userId?: unknown;
}

/**
 * POST /api/records/[id]/verify — Confirm & Verify (04-extraction-verification.md §4).
 * Blocked (200, with `blockedFields` populated) when any declaration is
 * still `notDetected` — the one blocker 04's edge-case table names. Not a
 * role check here — the page itself gates the button on
 * `verification.confirm`, and this endpoint trusts that gate the same way
 * every other mutation in this mock backend does.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as VerifyBody;
  const userId = typeof body.userId === "string" ? body.userId : null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const result = verifyRecord(id, userId);
  if (!result) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}
