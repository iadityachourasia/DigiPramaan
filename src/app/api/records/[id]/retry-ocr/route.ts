import { NextResponse } from "next/server";

import { retryExtractionForRecord } from "@/lib/server/scan-pipeline-store";

/**
 * POST /api/records/[id]/retry-ocr — Retry OCR (04's "OCR failed entirely"
 * edge case). Re-seeds the record's declarations as a fresh, successful
 * extraction — a retry always succeeds in this mock, the same
 * simplification the pipeline's own stage-scoped retry already makes.
 *
 * It now requires a `userId`. Re-extraction replaces every declaration and
 * discards any correction already made, and it recorded neither the action nor
 * who took it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const record = retryExtractionForRecord(id, userId);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(record);
}
