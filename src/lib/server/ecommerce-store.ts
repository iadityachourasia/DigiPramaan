/**
 * ecommerce-store.ts — server-side state for the E-commerce Listing Scanner
 * (08-ecommerce-listing-scanner.md).
 *
 * SAME MECHANISM AS scan-pipeline-store.ts, DIFFERENT SUBJECT
 * ------------------------------------------------------------
 * 08 §4 step 5 requires that an officer "can navigate away and return to
 * check batch progress" — the same closed-tab-survival problem mobile
 * handoff and the pipeline tracker already solved, so this reuses that
 * mechanism (an in-memory Map behind real Route Handlers) rather than
 * client state that would give every tab its own private copy.
 *
 * NO SECOND EXTRACTION PATH
 * --------------------------
 * 08 §2's "Pipeline Reuse" is explicit: this page "should not duplicate
 * that logic, only produce the same input shape". So scanning a listing
 * here calls `createPipelineRun()` — the exact function page 3's wizard
 * reaches through `createScan` → `createScanPipeline` → POST
 * /api/scan-pipelines — with `source: "E-commerce-Sourced"` and the
 * listing's own image standing in for a captured photograph.
 *
 * PER-LISTING STATUS IS DERIVED, NEVER STORED
 * --------------------------------------------
 * A batch does not keep its own copy of "how far along is listing 3" —
 * that would be a second source of truth free to drift from the pipeline
 * it claims to describe. Each listing's queued/scanning/done/failed is
 * computed on read from its own pipeline run's real stages, exactly as
 * `withAdvancedStages` derives progress from timestamps. It also makes
 * partial failure structurally impossible to get wrong: the runs share no
 * state, so one failing cannot block or hide another (08 §5).
 */

import { MOCK_ECOMMERCE_BATCH, MOCK_SINGLE_LISTING } from "@/lib/mock/ecommerce";
import type { EcommerceBatch, ScanMetadata, ScrapedListing, UploadedImage } from "@/types";

import { createPipelineRun, getPipelineRun } from "./scan-pipeline-store";

/**
 * Sentinel URL patterns that force each failure state deterministically.
 *
 * The input on this page IS a URL, so a magic URL is the natural demo
 * affordance — no query string to craft, nothing to remember beyond the
 * word itself. This mirrors the `?demo=` convention pages 2-4 use, chosen
 * to fit this page's own input instead.
 */
export const DEMO_URL_PATTERNS = {
  unrecognized: "no-product",
  empty: "empty",
  rateLimited: "rate-limited",
} as const;

export type ScrapeFailure = "invalid_url" | "unrecognized" | "empty" | "rate_limited";

export interface ScrapeResult {
  ok: boolean;
  failure?: ScrapeFailure;
  listing?: ScrapedListing;
  listings?: ScrapedListing[];
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** A freshly scraped listing has run nothing yet — the fixtures' own baked-in statuses are display seeds, not live state. */
function pristine(listing: ScrapedListing, index: number): ScrapedListing {
  const fresh: ScrapedListing = {
    id: `${listing.id}-${Date.now().toString(36)}-${index}`,
    listingUrl: listing.listingUrl,
    title: listing.title,
    descriptionExcerpt: listing.descriptionExcerpt,
    images: listing.images,
    status: "queued",
  };
  return fresh;
}

/** Single mode (08 §3): fetch one product listing for preview before anything is committed. */
export function scrapeListing(url: string): ScrapeResult {
  if (!isHttpUrl(url)) return { ok: false, failure: "invalid_url" };
  if (url.includes(DEMO_URL_PATTERNS.rateLimited)) return { ok: false, failure: "rate_limited" };
  if (url.includes(DEMO_URL_PATTERNS.unrecognized)) return { ok: false, failure: "unrecognized" };

  return { ok: true, listing: { ...pristine(MOCK_SINGLE_LISTING, 0), listingUrl: url } };
}

/** Bulk mode (08 §4): fetch the individual listings found on a category or search-results page. */
export function scrapeCategory(url: string): ScrapeResult {
  if (!isHttpUrl(url)) return { ok: false, failure: "invalid_url" };
  if (url.includes(DEMO_URL_PATTERNS.rateLimited)) return { ok: false, failure: "rate_limited" };
  if (url.includes(DEMO_URL_PATTERNS.empty)) return { ok: false, failure: "empty" };

  return { ok: true, listings: MOCK_ECOMMERCE_BATCH.listings.map(pristine) };
}

interface StoredBatch {
  id: string;
  sourceUrl: string;
  createdAt: string;
  metadata: ScanMetadata;
  /** Listing as scraped, plus the pipeline run it was handed to (if it was selected). */
  listings: Array<{ listing: ScrapedListing; scanId?: string }>;
}

const batches = new Map<string, StoredBatch>();

/** The listing's image stands in for a captured photograph — see `angleFor` below. */
function toPipelineImages(images: UploadedImage[]) {
  return images.map((image, index) => ({
    /*
     * The first (hero) image maps to `front`: it is the listing's primary
     * shot and becomes the record's thumbnail via `capturedImages[0]`.
     * Everything after it maps to `additional` rather than being passed off
     * as `back`/`side_pdp` — an e-commerce gallery's second image is not
     * the back of the pack, and claiming otherwise would put a fabricated
     * angle label on a real record. `buildFinalRecord` already renders an
     * honest placeholder for the angles no image covers.
     */
    angle: (index === 0 ? "front" : "additional") as "front" | "additional",
    fileName: image.fileName,
    url: image.url,
    sizeBytes: image.sizeBytes,
  }));
}

/** Starts one independent pipeline run for a listing, returning its scan id. */
function startRun(
  listing: ScrapedListing,
  metadata: ScanMetadata,
  scannedByUserId: string,
  batchId?: string
): string {
  const scanId = `ecom-${listing.id}`;
  createPipelineRun({
    scanId,
    metadata: {
      ...metadata,
      productName: listing.title,
      ecommerceListingUrl: listing.listingUrl,
    },
    images: toPipelineImages(listing.images),
    scannedByUserId,
    source: "E-commerce-Sourced",
    ...(batchId ? { batchId } : {}),
  });
  return scanId;
}

/**
 * Single mode's commit (08 §3 step 3-4). Returns the scan id so the caller
 * can route to `/scan/[id]/status` — the same Processing Pipeline Tracker a
 * physically captured scan lands on.
 */
export function scanSingleListing(
  listing: ScrapedListing,
  metadata: ScanMetadata,
  scannedByUserId: string
): { scanId: string; recordId: string } {
  const scanId = startRun(listing, metadata, scannedByUserId);
  return { scanId, recordId: `rec-${scanId}` };
}

/** Bulk mode's commit (08 §4 step 4): one independent pipeline run per selected listing. */
export function createBatch(
  sourceUrl: string,
  listings: ScrapedListing[],
  selectedIds: string[],
  metadata: ScanMetadata,
  scannedByUserId: string
): EcommerceBatch {
  const id = `batch-${Date.now().toString(36)}`;
  const selected = new Set(selectedIds);

  const stored: StoredBatch = {
    id,
    sourceUrl,
    createdAt: new Date().toISOString(),
    metadata,
    listings: listings.map((listing) =>
      selected.has(listing.id)
        ? { listing, scanId: startRun(listing, metadata, scannedByUserId, id) }
        : { listing }
    ),
  };

  batches.set(id, stored);
  return toPublicBatch(stored);
}

/**
 * Each listing's status, computed fresh from its own pipeline run rather
 * than stored — a summary of the eight-stage run the officer can open in
 * full via the tracker.
 */
function deriveListing(entry: StoredBatch["listings"][number]): ScrapedListing {
  const { listing, scanId } = entry;
  if (!scanId) return { ...listing, status: "queued" };

  const run = getPipelineRun(scanId);
  if (!run) return { ...listing, status: "queued" };

  const failed = run.stages.find((stage) => stage.state === "failed");
  if (failed) {
    return {
      ...listing,
      status: "failed",
      failureReason: failed.failureReason ?? "This listing could not be processed.",
    };
  }

  const ready = run.stages.find((stage) => stage.id === "readyForVerification");
  if (ready?.state === "completed") {
    return { ...listing, status: "done", recordId: run.recordId };
  }

  return { ...listing, status: "scanning", recordId: run.recordId };
}

function toPublicBatch(stored: StoredBatch): EcommerceBatch {
  return {
    id: stored.id,
    sourceUrl: stored.sourceUrl,
    createdAt: stored.createdAt,
    listings: stored.listings.map(deriveListing),
  };
}

export function getBatch(batchId: string): EcommerceBatch | undefined {
  const stored = batches.get(batchId);
  return stored ? toPublicBatch(stored) : undefined;
}

/** Every listing in the batch that has produced a scan run — used for the "scan id → tracker" links. */
export function getBatchScanIds(batchId: string): Record<string, string> {
  const stored = batches.get(batchId);
  if (!stored) return {};
  const out: Record<string, string> = {};
  for (const entry of stored.listings) {
    if (entry.scanId) out[entry.listing.id] = entry.scanId;
  }
  return out;
}
