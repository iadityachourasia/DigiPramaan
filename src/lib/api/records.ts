/**
 * records.ts — compliance records API client.
 */

import type {
  ComplianceRecord,
  DeclarationFieldId,
  RecordFilters,
  RecordSort,
  RecordsPage,
} from "@/types";
import type { ApiResult } from "./client";

/*
 * Every function in this file is a real HTTP call to
 * scan-pipeline-store.ts's Route Handlers, never gated by `isMockMode()`.
 * Same reasoning as Mobile Handoff, the Processing Pipeline Tracker, and
 * page 4's record surface: this is server-authoritative state — a
 * correction, an archive, a bulk flag, must be visible however the record
 * is next opened, including from Compliance Records' own list view, which
 * needs to see records the live pipeline created, not just the static
 * seeds a client-side mock branch would be limited to.
 */

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

/* ------------------------------------------------------------------ *
 * Compliance Records (page 5)
 * ------------------------------------------------------------------ */

/**
 * Builds the query string `GET /api/records` expects — every
 * `RecordFilters` array field repeats the key once per value
 * (`?complianceStatuses=Compliant&complianceStatuses=Pending`), matching
 * `URLSearchParams.getAll()` on the server and `useSearchParams().getAll()`
 * on the client, so nothing needs custom comma-splitting.
 */
function buildRecordsQuery(
  filters: RecordFilters,
  sort: RecordSort,
  page: number,
  pageSize: number
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  for (const value of filters.categories) params.append("categories", value);
  for (const value of filters.complianceStatuses) params.append("complianceStatuses", value);
  for (const value of filters.regions) params.append("regions", value);
  for (const value of filters.manufacturers) params.append("manufacturers", value);
  for (const value of filters.sources) params.append("sources", value);
  for (const value of filters.violationCategoryIds) params.append("violationCategoryIds", value);
  for (const value of filters.batchIds) params.append("batchIds", value);
  params.set("sort", sort);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

export function fetchRecords(
  filters: RecordFilters,
  sort: RecordSort,
  page: number,
  pageSize: number
): Promise<ApiResult<RecordsPage>> {
  return requestJson(`/api/records?${buildRecordsQuery(filters, sort, page, pageSize)}`);
}

export function archiveRecord(recordId: string): Promise<ApiResult<ComplianceRecord>> {
  return postJson(`/api/records/${recordId}/archive`, {});
}

export interface BulkNeedsReviewResponse {
  updated: ComplianceRecord[];
  skipped: string[];
}

export function bulkSetNeedsReview(
  recordIds: string[],
  userId: string,
  flag: boolean
): Promise<ApiResult<BulkNeedsReviewResponse>> {
  return postJson("/api/records/bulk/needs-review", { recordIds, userId, flag });
}

/* ------------------------------------------------------------------ *
 * Declaration Extraction & Verification (page 4)
 * ------------------------------------------------------------------ */

/**
 * `demoZeroDeclarations` maps to `?demo=zero-declarations` — a QA
 * convenience that auto-creates a total-OCR-failure record when `id`
 * matches nothing yet (see the route handler).
 */
export function fetchRecord(
  id: string,
  demoZeroDeclarations?: boolean
): Promise<ApiResult<ComplianceRecord>> {
  const query = demoZeroDeclarations ? "?demo=zero-declarations" : "";
  return requestJson(`/api/records/${id}${query}`);
}

export function saveCorrection(
  recordId: string,
  fieldId: DeclarationFieldId,
  value: string,
  userId: string
): Promise<ApiResult<ComplianceRecord>> {
  return postJson(`/api/records/${recordId}/corrections`, { fieldId, value, userId });
}

export interface VerifyRecordResponse {
  record: ComplianceRecord;
  blockedFields: DeclarationFieldId[];
}

export function verifyRecord(
  recordId: string,
  userId: string
): Promise<ApiResult<VerifyRecordResponse>> {
  return postJson(`/api/records/${recordId}/verify`, { userId });
}

/**
 * `flag` defaults to `true` (existing callers on pages 4/5 never pass it).
 * Page 6 passes `flag: false` to clear an already-set Needs Review flag —
 * see `flagRecordNeedsReview`'s own doc comment for why this extends the
 * existing mutation rather than adding a second one.
 */
export function flagNeedsReview(
  recordId: string,
  userId: string,
  note?: string,
  flag?: boolean
): Promise<ApiResult<ComplianceRecord>> {
  return postJson(`/api/records/${recordId}/needs-review`, {
    userId,
    ...(note ? { note } : {}),
    ...(flag !== undefined ? { flag } : {}),
  });
}

export function retryOcr(recordId: string): Promise<ApiResult<ComplianceRecord>> {
  return postJson(`/api/records/${recordId}/retry-ocr`, {});
}

/* ------------------------------------------------------------------ *
 * Product Compliance Detail (page 6)
 * ------------------------------------------------------------------ */

/** Flag for Enforcement — Enforcement Officer/Admin only, one-way (no clear). */
export function flagForEnforcement(
  recordId: string,
  userId: string
): Promise<ApiResult<ComplianceRecord>> {
  return postJson(`/api/records/${recordId}/flag-enforcement`, { userId });
}
