import { NextResponse } from "next/server";

import {
  createZeroDeclarationDemoRecord,
  getRecordById,
} from "@/lib/server/scan-pipeline-store";

/**
 * GET /api/records/[id] — read path for Declaration Extraction & Verification
 * (page 4). Wraps `getRecordById()`, which checks the pipeline store (a
 * freshly-piped record) before falling back to the static seeds (an
 * already-Verified record re-opened later) — see the page 4 plan's Loose
 * End B.
 *
 * `?demo=zero-declarations` on this route directly auto-creates a
 * total-OCR-failure record when `id` matches nothing yet — a QA convenience
 * for testing Retry OCR / Manual Entry without stepping through the whole
 * wizard and pipeline first, mirroring the pipeline tracker's own
 * `?demo=` auto-create convenience.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  let record = getRecordById(id);

  if (!record && url.searchParams.get("demo") === "zero-declarations") {
    record = createZeroDeclarationDemoRecord("demo");
  }

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}
