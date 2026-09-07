/**
 * ecommerce.ts — E-commerce Listing Scanner API client (page 8).
 *
 * Always real HTTP to this app's own Route Handlers, never gated by
 * `isMockMode()` — same reasoning as the pipeline and record surfaces: a
 * batch has to survive the officer navigating away and coming back (08 §4
 * step 5), which a client-side mock branch cannot do.
 */

import type { EcommerceBatch, ScanMetadata, ScrapedListing } from "@/types";
import type { ApiResult } from "./client";

async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        status: response.status,
        message: body?.error ?? `Request to ${path} failed with status ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Why a scrape didn't produce anything — each renders as its own specific message (08 §5). */
export type ScrapeFailure = "invalid_url" | "unrecognized" | "empty" | "rate_limited";

export interface ScrapeResponse {
  ok: boolean;
  failure?: ScrapeFailure;
  listing?: ScrapedListing;
  listings?: ScrapedListing[];
}

export function scrapeUrl(
  url: string,
  mode: "single" | "bulk"
): Promise<ApiResult<ScrapeResponse>> {
  return postJson("/api/ecommerce/scrape", { url, mode });
}

export interface ScanListingResponse {
  scanId: string;
  recordId: string;
}

export function scanListing(
  listing: ScrapedListing,
  metadata: ScanMetadata,
  scannedByUserId: string
): Promise<ApiResult<ScanListingResponse>> {
  return postJson("/api/ecommerce/scan", { listing, metadata, scannedByUserId });
}

export function createBatch(
  sourceUrl: string,
  listings: readonly ScrapedListing[],
  selectedIds: readonly string[],
  metadata: ScanMetadata,
  scannedByUserId: string
): Promise<ApiResult<EcommerceBatch>> {
  return postJson("/api/ecommerce/batches", {
    sourceUrl,
    listings,
    selectedIds,
    metadata,
    scannedByUserId,
  });
}

export interface BatchResponse {
  batch: EcommerceBatch;
  /** listing id → its own pipeline scan id, for the per-row tracker link. */
  scanIds: Record<string, string>;
}

export function fetchBatch(batchId: string): Promise<ApiResult<BatchResponse>> {
  return requestJson(`/api/ecommerce/batches/${batchId}`);
}
