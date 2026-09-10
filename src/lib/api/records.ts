/**
 * records.ts — compliance records API client.
 *
 * Phase 5 cuts the demo-path surfaces over to the real FastAPI backend
 * (apiGet/apiPost, client.ts's Bearer-token convention — same pattern Phase 4
 * established in productDna.ts/cases.ts): list, detail, corrections, verify,
 * resolutions, flag-enforcement, retry-enrichment. Archive and the bulk/
 * single Needs-Review actions have no real backend endpoint yet (outside
 * Phase 5's demo path) and deliberately stay on the old mock route handlers
 * rather than being pointed at something that would 404.
 *
 * The real backend's GET /records only understands `status`/`region`/
 * `page`/`pageSize` server-side — the richer RecordFilters shape (query
 * text, categories, manufacturers, sources, violationCategoryIds, date
 * range, batchIds) is applied client-side on top of the fetched page.
 * Known limitation: `totalCount` reflects the server-side status/region
 * scope, not the further client-applied filters — acceptable at
 * hackathon-demo record volumes, called out in the Phase 5 report.
 */

import { API } from "@/lib/constants";
import type {
  ComplianceRecord,
  DeclarationFieldId,
  RecordFilters,
  RecordSort,
  RecordsPage,
} from "@/types";
import { apiGet, apiPost } from "./client";
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

function matchesFilters(record: ComplianceRecord, filters: RecordFilters): boolean {
  if (filters.query) {
    const q = filters.query.toLowerCase();
    if (
      !record.productName.toLowerCase().includes(q) &&
      !record.manufacturerName.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  if (filters.dateFrom && record.scannedAt < filters.dateFrom) return false;
  if (filters.dateTo && record.scannedAt > filters.dateTo) return false;
  if (filters.categories.length > 0 && !filters.categories.includes(record.category)) return false;
  if (
    filters.complianceStatuses.length > 0 &&
    !filters.complianceStatuses.includes(record.complianceStatus)
  ) {
    return false;
  }
  if (filters.regions.length > 0 && !filters.regions.includes(record.region)) return false;
  if (filters.manufacturers.length > 0 && !filters.manufacturers.includes(record.manufacturerName)) {
    return false;
  }
  if (filters.sources.length > 0 && !filters.sources.includes(record.source)) return false;
  if (
    filters.violationCategoryIds.length > 0 &&
    !record.violations.some((v) => filters.violationCategoryIds.includes(v.categoryId))
  ) {
    return false;
  }
  if (filters.batchIds.length > 0 && !(record.batchId && filters.batchIds.includes(record.batchId))) {
    return false;
  }
  return true;
}

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

export async function fetchRecords(
  filters: RecordFilters,
  sort: RecordSort,
  page: number,
  pageSize: number
): Promise<ApiResult<RecordsPage>> {
  const params = new URLSearchParams();
  if (filters.complianceStatuses.length === 1) params.set("status", filters.complianceStatuses[0]!);
  if (filters.regions.length === 1) params.set("region", filters.regions[0]!);
  params.set("page", "1");
  params.set("pageSize", "200");

  const result = await apiGet<RecordsPage>(`${API.records.list}?${params.toString()}`);
  if (!result.ok) return result;

  const filtered = sortRecords(result.data.rows.filter((r) => matchesFilters(r, filters)), sort);
  const start = (page - 1) * pageSize;
  return {
    ok: true,
    data: {
      rows: filtered.slice(start, start + pageSize),
      totalCount: filtered.length,
      page,
      pageSize,
    },
  };
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

export function fetchRecord(id: string): Promise<ApiResult<ComplianceRecord>> {
  return apiGet(API.records.detail(id));
}

export function saveCorrection(
  recordId: string,
  fieldId: DeclarationFieldId,
  value: string
): Promise<ApiResult<ComplianceRecord>> {
  return apiPost(API.records.corrections(recordId), { field_id: fieldId, value });
}

export interface VerifyRecordResponse {
  record: ComplianceRecord;
  blockedFields: DeclarationFieldId[];
}

export function verifyRecord(recordId: string): Promise<ApiResult<VerifyRecordResponse>> {
  return apiPost(API.records.verify(recordId), {});
}

/**
 * `flag` defaults to `true` (existing callers on pages 4/5 never pass it).
 * No real backend endpoint models Needs Review yet — stays on the mock
 * route (outside Phase 5's demo path), a documented gap rather than a
 * silently-broken real call.
 */
export function flagNeedsReview(
  recordId: string,
  userId: string,
  note?: string,
  flag?: boolean
): Promise<ApiResult<ComplianceRecord>> {
  return postJsonMock(`/api/records/${recordId}/needs-review`, {
    userId,
    ...(note ? { note } : {}),
    ...(flag !== undefined ? { flag } : {}),
  });
}

/** Retry a failed intelligence-enrichment linkage (Phase 4/5's real endpoint) — repurposes the old "retry OCR" affordance. */
export function retryOcr(recordId: string): Promise<ApiResult<ComplianceRecord>> {
  return apiPost(API.records.retryEnrichment(recordId), {});
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
