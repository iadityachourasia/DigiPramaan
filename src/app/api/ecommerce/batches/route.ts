import { NextResponse } from "next/server";

import { createBatch } from "@/lib/server/ecommerce-store";
import type { ScanMetadata, ScrapedListing } from "@/types";

interface CreateBatchBody {
  sourceUrl?: unknown;
  listings?: unknown;
  selectedIds?: unknown;
  metadata?: unknown;
  scannedByUserId?: unknown;
}

/**
 * POST /api/ecommerce/batches — bulk mode's "Scan Selected" (08 §4).
 * Starts one independent pipeline run per selected listing; unselected
 * listings stay in the batch as `queued` so the officer still sees what
 * was found and chose to skip.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as CreateBatchBody;

  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : null;
  const listings = Array.isArray(body.listings) ? (body.listings as ScrapedListing[]) : null;
  const selectedIds = Array.isArray(body.selectedIds)
    ? body.selectedIds.filter((id): id is string => typeof id === "string")
    : [];
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
  const scannedByUserId = typeof body.scannedByUserId === "string" ? body.scannedByUserId : null;

  if (!sourceUrl || !listings || !metadata || !scannedByUserId) {
    return NextResponse.json(
      { error: "sourceUrl, listings, metadata and scannedByUserId are all required" },
      { status: 400 }
    );
  }

  if (selectedIds.length === 0) {
    return NextResponse.json({ error: "Select at least one listing to scan" }, { status: 400 });
  }

  return NextResponse.json(
    createBatch(sourceUrl, listings, selectedIds, metadata as ScanMetadata, scannedByUserId),
    { status: 201 }
  );
}
