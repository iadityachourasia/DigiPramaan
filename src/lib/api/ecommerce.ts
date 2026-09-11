/**
 * ecommerce.ts — E-commerce Listing Scanner API client (page 8).
 *
 * Real mode calls the real backend (Phase 9's actual fetch/parse pipeline,
 * SSRF-guarded, never trusting a client-supplied image list) via
 * `API.ecommerce.*`. Mock mode keeps calling this app's own Next.js Route
 * Handlers/in-memory store completely unchanged — same `isMockMode()`
 * branch every other real API client in this file's siblings already uses
 * (`scans.ts` is the reference pattern).
 */

import { API } from "@/lib/constants";
import type { EcommerceBatch, ScanMetadata, ScrapedListing } from "@/types";
import { apiGet, apiPost, isMockMode, type ApiResult } from "./client";

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
  if (isMockMode()) {
    return postJson("/api/ecommerce/scrape", { url, mode });
  }
  return apiPost(API.ecommerce.scrapePreview, { url, mode });
}

export interface ScanListingResponse {
  scanId: string;
  recordId: string;
}

export async function scanListing(
  listing: ScrapedListing,
  metadata: ScanMetadata,
  scannedByUserId: string
): Promise<ApiResult<ScanListingResponse>> {
  if (isMockMode()) {
    return postJson("/api/ecommerce/scan", { listing, metadata, scannedByUserId });
  }
  // The real endpoint fetches the listing's images itself — it never
  // trusts the client's own scraped image list — so only the URL and
  // scan metadata are sent, not `listing.images`.
  const result = await apiPost<{ id: string; recordId: string }>(API.ecommerce.scan, {
    url: listing.listingUrl,
    category: metadata.category,
    region: metadata.region,
    manufacturerName: metadata.manufacturerName,
  });
  if (!result.ok) return result;
  return { ok: true, data: { scanId: result.data.id, recordId: result.data.recordId } };
}

export async function createBatch(
  sourceUrl: string,
  listings: readonly ScrapedListing[],
  selectedIds: readonly string[],
  metadata: ScanMetadata,
  scannedByUserId: string
): Promise<ApiResult<EcommerceBatch>> {
  if (isMockMode()) {
    return postJson("/api/ecommerce/batches", {
      sourceUrl,
      listings,
      selectedIds,
      metadata,
      scannedByUserId,
    });
  }
  const selected = new Set(selectedIds);
  const selectedUrls = listings.filter((l) => selected.has(l.id)).map((l) => l.listingUrl);
  const result = await apiPost<{ batch: EcommerceBatch }>(API.ecommerce.batch, {
    sourceUrl,
    selectedUrls,
    category: metadata.category,
    region: metadata.region,
    manufacturerName: metadata.manufacturerName,
  });
  if (!result.ok) return result;
  return { ok: true, data: result.data.batch };
}

export interface BatchResponse {
  batch: EcommerceBatch;
  /** listing id → its own pipeline scan id, for the per-row tracker link. */
  scanIds: Record<string, string>;
}

export function fetchBatch(batchId: string): Promise<ApiResult<BatchResponse>> {
  if (isMockMode()) {
    return requestJson(`/api/ecommerce/batches/${batchId}`);
  }
  return apiGet(API.ecommerce.batchDetail(batchId));
}
