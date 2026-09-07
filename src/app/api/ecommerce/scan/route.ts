import { NextResponse } from "next/server";

import { scanSingleListing } from "@/lib/server/ecommerce-store";
import type { ScanMetadata, ScrapedListing } from "@/types";

interface ScanBody {
  listing?: unknown;
  metadata?: unknown;
  scannedByUserId?: unknown;
}

/**
 * POST /api/ecommerce/scan — single mode's "Scan Listing" (08 §3).
 * Creates one pipeline run through the exact same `createPipelineRun` page
 * 3's wizard reaches, tagged `E-commerce-Sourced`, and returns the scan id
 * so the page can route to `/scan/[id]/status` — the same Processing
 * Pipeline Tracker a physically captured scan lands on.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as ScanBody;

  const listing = body.listing && typeof body.listing === "object" ? body.listing : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
  const scannedByUserId = typeof body.scannedByUserId === "string" ? body.scannedByUserId : null;

  if (!listing || !metadata || !scannedByUserId) {
    return NextResponse.json(
      { error: "listing, metadata and scannedByUserId are all required" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    scanSingleListing(listing as ScrapedListing, metadata as ScanMetadata, scannedByUserId),
    { status: 201 }
  );
}
