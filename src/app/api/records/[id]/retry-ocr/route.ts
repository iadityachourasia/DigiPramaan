import { NextResponse } from "next/server";

import { retryExtractionForRecord } from "@/lib/server/scan-pipeline-store";

/**
 * POST /api/records/[id]/retry-ocr — Retry OCR (04's "OCR failed entirely"
 * edge case). Re-seeds the record's declarations as a fresh, successful
 * extraction — a retry always succeeds in this mock, the same
 * simplification the pipeline's own stage-scoped retry already makes.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = retryExtractionForRecord(id);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(record);
}
