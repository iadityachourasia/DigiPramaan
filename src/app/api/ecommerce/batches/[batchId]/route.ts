import { NextResponse } from "next/server";

import { getBatch, getBatchScanIds } from "@/lib/server/ecommerce-store";

/**
 * GET /api/ecommerce/batches/[batchId] — polled by the batch queue.
 * Each listing's status is derived fresh from its own pipeline run on
 * every read (see `ecommerce-store.ts`), which is what lets an officer
 * navigate away and come back to accurate progress (08 §4 step 5).
 *
 * `scanIds` rides along so each row can link to its own Processing
 * Pipeline Tracker while it is still in flight.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const batch = getBatch(batchId);

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json({ batch, scanIds: getBatchScanIds(batchId) });
}
