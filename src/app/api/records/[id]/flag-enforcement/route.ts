import { NextResponse } from "next/server";

import { flagRecordForEnforcement } from "@/lib/server/scan-pipeline-store";

interface FlagEnforcementBody {
  userId?: unknown;
}

/**
 * POST /api/records/[id]/flag-enforcement — Flag for Enforcement
 * (06-product-compliance-detail.md §7), Enforcement Officer/Admin only
 * per 00-README.md §C. No server-side role re-check — the page gates the
 * button on `record.flagForEnforcement` and this endpoint trusts that
 * gate, the same pattern every other mutation in this mock backend
 * already follows.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as FlagEnforcementBody;
  const userId = typeof body.userId === "string" ? body.userId : null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const record = flagRecordForEnforcement(id, userId);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(record);
}
