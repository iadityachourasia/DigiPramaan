import { NextResponse } from "next/server";

import { bulkSetNeedsReview } from "@/lib/server/scan-pipeline-store";

interface BulkNeedsReviewBody {
  recordIds?: unknown;
  userId?: unknown;
  flag?: unknown;
}

/**
 * POST /api/records/bulk/needs-review — bulk status change (05 §2),
 * scoped to Flag/Clear Needs Review only (see `bulkSetNeedsReview`'s own
 * doc comment for why arbitrary bulk status writes aren't offered).
 * Admin-only per 00-README.md §C, trusted the same way every other
 * mutation here is.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as BulkNeedsReviewBody;

  const recordIds = Array.isArray(body.recordIds)
    ? body.recordIds.filter((id): id is string => typeof id === "string")
    : [];
  const userId = typeof body.userId === "string" ? body.userId : null;
  const flag = typeof body.flag === "boolean" ? body.flag : null;

  if (recordIds.length === 0 || !userId || flag === null) {
    return NextResponse.json(
      { error: "recordIds (non-empty), userId and flag are all required" },
      { status: 400 }
    );
  }

  return NextResponse.json(bulkSetNeedsReview(recordIds, userId, flag));
}
