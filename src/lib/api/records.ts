/**
 * records.ts — compliance records API client.
 *
 * Phase 5 cut the demo-path surfaces over to the real FastAPI backend
 * (apiGet/apiPost, client.ts's Bearer-token convention — same pattern Phase 4
 * established in productDna.ts/cases.ts): list, detail, corrections, verify,
 * resolutions, flag-enforcement, retry-enrichment, single-record Needs
 * Review (§AF, 2026-09-25 — it had a real endpoint the whole time, just
 * never wired up). Archive and the bulk Needs-Review action still have no
 * real backend endpoint reachable from the frontend's constants (bulk's
 * real route exists — POST /records/bulk/review-flag — but hasn't been
 * verified/wired yet) and deliberately stay on the old mock route handlers
 * rather than being pointed at something that would 404.
 *
 * Phase 7: `fetchRecords()` now sends every RecordFilters field as a real
 * server-side query param and passes page/pageSize straight through — no
 * more fetch-200-then-filter-in-memory. `totalCount` now reflects the true
 * filtered count from the database, not an unfiltered 200-row page. `sort`
 * has no server-side equivalent (the backend always orders by scannedAt
 * desc) — applied client-side to the current page only when the officer
 * picks something other than "newest", a small, documented scope choice
 * (server-side sort would need a new backend param this phase didn't add).
 */

import { API } from "@/lib/constants";
import type {
  ComplianceRecord,
  DeclarationFieldId,
  RecordFilters,
  RecordSort,
  RecordsPage,
  UploadedImage,
} from "@/types";
import { apiGet, apiPost, isMockMode } from "./client";
import type { ApiResult } from "./client";

const REAL_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("lmcs-token");
}

/**
 * Real evidence photographs come back from `to_frontend_record()` as a bare
 * `/evidence-images/{id}` path (the backend never embeds a token) — this
 * resolves it to the real FastAPI origin plus `?access_token=`, the same
 * convention `reportDownloadHref()` (reports.ts) already established for
 * record-scope report downloads. Placeholder images (`/images/placeholder/
 * *.svg`, a static Next.js asset) pass through unchanged.
 */
function resolveEvidenceImageUrl(url: string): string {
  if (!url.startsWith("/evidence-images/")) return url;
  const token = getSessionToken();
  const params = new URLSearchParams();
  if (token) params.set("access_token", token);
  return `${REAL_API_BASE}${url}?${params.toString()}`;
}

function hydrateImage(image: UploadedImage): UploadedImage {
  return { ...image, url: resolveEvidenceImageUrl(image.url) };
}

function hydrateRecordImages(record: ComplianceRecord): ComplianceRecord {
  return {
    ...record,
    thumbnail: hydrateImage(record.thumbnail),
    capturedImages: record.capturedImages.map(hydrateImage),
  };
}

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

function postJsonMock<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ *
 * Compliance Records (page 5)
 * ------------------------------------------------------------------ */

function sortRecords(records: ComplianceRecord[], sort: RecordSort): ComplianceRecord[] {
  const rows = [...records];
  switch (sort) {
    case "oldest":
      return rows.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
    case "alphabetical":
      return rows.sort((a, b) => a.productName.localeCompare(b.productName));
    case "status":
      return rows.sort((a, b) => a.complianceStatus.localeCompare(b.complianceStatus));
    case "newest":
    case "relevance":
    default:
      return rows.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  }
}

/**
 * Phase 8 — does a free-text search string look like a printed barcode
 * (all digits, one of the real lengths this pipeline decodes: EAN-8,
 * UPC-A/EAN-13-ish range, GTIN-14)? Exported as its own pure function so
 * the routing decision is unit-testable without a network call.
 */
export function looksLikeBarcode(query: string): boolean {
  return /^\d{8,14}$/.test(query.trim());
}

export async function fetchRecords(
  filters: RecordFilters,
  sort: RecordSort,
  page: number,
  pageSize: number
): Promise<ApiResult<RecordsPage>> {
  const params = new URLSearchParams();
  if (filters.query) {
    // Phase 8 — no new search UI control (matches Phase 7's own "zero new
    // UI controls" constraint): the existing free-text box's value is
    // routed to the barcode/GTIN search param instead of `query` when it
    // looks like one (all digits, 8-14 characters — the real EAN-8/UPC-A/
    // EAN-13/GTIN-14 lengths this pipeline decodes). The backend ANDs
    // `query` and `barcode` rather than OR-ing them, so sending both would
    // always return zero rows (an all-digit string never matches a
    // product/manufacturer name) — `barcode` alone is the correct route.
    if (looksLikeBarcode(filters.query)) {
      params.set("barcode", filters.query.trim());
    } else {
      params.set("query", filters.query);
    }
  }
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  filters.categories.forEach((v) => params.append("categories", v));
  filters.regions.forEach((v) => params.append("regions", v));
  filters.complianceStatuses.forEach((v) => params.append("statuses", v));
  filters.sources.forEach((v) => params.append("sources", v));
  filters.manufacturers.forEach((v) => params.append("manufacturers", v));
  filters.violationCategoryIds.forEach((v) => params.append("violationCategoryIds", v));
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const result = await apiGet<RecordsPage>(`${API.records.list}?${params.toString()}`);
  if (!result.ok) return result;

  const hydratedRows = result.data.rows.map(hydrateRecordImages);
  const rows = sort === "newest" || sort === "relevance" ? hydratedRows : sortRecords(hydratedRows, sort);
  return { ok: true, data: { ...result.data, rows } };
}

/** No real backend endpoint yet — archiving stays on the mock route (outside Phase 5's demo path). */
export function archiveRecord(recordId: string, userId: string): Promise<ApiResult<ComplianceRecord>> {
  return postJsonMock(`/api/records/${recordId}/archive`, { userId });
}

export interface BulkNeedsReviewResponse {
  updated: ComplianceRecord[];
  skipped: string[];
}

/** No real backend endpoint yet — stays on the mock route (outside Phase 5's demo path). */
export function bulkSetNeedsReview(
  recordIds: string[],
  userId: string,
  flag: boolean
): Promise<ApiResult<BulkNeedsReviewResponse>> {
  return postJsonMock("/api/records/bulk/needs-review", { recordIds, userId, flag });
}

/* ------------------------------------------------------------------ *
 * Declaration Extraction & Verification (page 4)
 * ------------------------------------------------------------------ */

export async function fetchRecord(id: string): Promise<ApiResult<ComplianceRecord>> {
  const result = await apiGet<ComplianceRecord>(API.records.detail(id));
  if (!result.ok) return result;
  return { ok: true, data: hydrateRecordImages(result.data) };
}

export async function saveCorrection(
  recordId: string,
  fieldId: DeclarationFieldId,
  value: string
): Promise<ApiResult<ComplianceRecord>> {
  const result = await apiPost<ComplianceRecord>(API.records.corrections(recordId), {
    field_id: fieldId,
    value,
  });
  if (!result.ok) return result;
  return { ok: true, data: hydrateRecordImages(result.data) };
}

export interface VerifyRecordResponse {
  record: ComplianceRecord;
  blockedFields: DeclarationFieldId[];
}

export async function verifyRecord(recordId: string): Promise<ApiResult<VerifyRecordResponse>> {
  const result = await apiPost<VerifyRecordResponse>(API.records.verify(recordId), {});
  if (!result.ok) return result;
  return { ok: true, data: { ...result.data, record: hydrateRecordImages(result.data.record) } };
}

/**
 * `flag` defaults to `true` (existing callers on pages 4/5 never pass it).
 * `POST /records/{id}/review-flag` (backend/app/api/v1/records.py) is the
 * real backend for this — this file's own header comment previously
 * claimed no such endpoint existed, but it's been live since Phase 1.3
 * (migration 0008, record_review_flags); nothing here ever called it, the
 * same gap the Activity Log client had (§AF, 2026-09-24). `userId` is kept
 * in the signature for callers (the backend derives the actor from the
 * auth token, not the body), and stays unused in the real branch.
 */
export async function flagNeedsReview(
  recordId: string,
  userId: string,
  note?: string,
  flag?: boolean
): Promise<ApiResult<ComplianceRecord>> {
  if (!isMockMode()) {
    const result = await apiPost<ComplianceRecord>(API.records.flagNeedsReview(recordId), {
      flag: flag ?? true,
      ...(note ? { note } : {}),
    });
    if (!result.ok) return result;
    return { ok: true, data: hydrateRecordImages(result.data) };
  }
  return postJsonMock(`/api/records/${recordId}/needs-review`, {
    userId,
    ...(note ? { note } : {}),
    ...(flag !== undefined ? { flag } : {}),
  });
}

/** Retry a failed intelligence-enrichment linkage (Phase 4/5's real endpoint) — repurposes the old "retry OCR" affordance. */
export async function retryOcr(recordId: string): Promise<ApiResult<ComplianceRecord>> {
  const result = await apiPost<ComplianceRecord>(API.records.retryEnrichment(recordId), {});
  if (!result.ok) return result;
  return { ok: true, data: hydrateRecordImages(result.data) };
}

/* ------------------------------------------------------------------ *
 * Product Compliance Detail (page 6)
 * ------------------------------------------------------------------ */

export interface FlagForEnforcementResponse {
  id: string;
  status: string;
  originatingRecordId: string;
  createdAt: string | null;
}

/** Flag for Enforcement — Enforcement Officer/Admin only, one-way (no clear). */
export function flagForEnforcement(recordId: string): Promise<ApiResult<FlagForEnforcementResponse>> {
  return apiPost(API.records.flagEnforcement(recordId), {});
}
