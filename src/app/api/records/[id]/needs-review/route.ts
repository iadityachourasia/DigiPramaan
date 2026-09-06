import { NextResponse } from "next/server";

import { flagRecordNeedsReview } from "@/lib/server/scan-pipeline-store";

interface NeedsReviewBody {
  userId?: unknown;
  note?: unknown;
  flag?: unknown;
}

/**
 * POST /api/records/[id]/needs-review — Flag as Needs Review, available to
 * all three roles (00-README.md §C). Only sets `needsReviewFlag`;
 * Verification Status is untouched.
 *
 * `flag` is optional and defaults to `true` (existing callers on pages 4/5
 * never send it) — page 6 sends `flag: false` to clear an already-set flag
 * rather than re-flagging it, mirroring `bulk/needs-review`'s own shape.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as NeedsReviewBody;
  const userId = typeof body.userId === "string" ? body.userId : null;
  const note = typeof body.note === "string" ? body.note : undefined;
  const flag = typeof body.flag === "boolean" ? body.flag : true;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const record = flagRecordNeedsReview(id, userId, note, flag);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(record);
}
