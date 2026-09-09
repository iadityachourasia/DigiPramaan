/**
 * reports.ts — Reports & Profile API client (page 10).
 *
 * Real HTTP calls to `report-store.ts`'s Route Handlers, never gated by
 * `isMockMode()` — the same server-authoritative rule records.ts,
 * analytics.ts and manufacturers.ts follow. A report generated in one tab
 * must be in Download History in another, and generation needs the live
 * record set rather than the static seeds.
 *
 * Replaces an earlier stub whose mock branch returned `[]` instead of the
 * fixtures, and whose `ReportResponse` was missing `scope`, `rowCount` and
 * `generatedByUserName` — everything the history table actually renders.
 */

import type {
  GeneratedReport,
  ReportAccessibility,
  ReportBlockReason,
  ReportDocument,
  ReportFormat,
  ReportRun,
  ReportScope,
  ReportStageId,
} from "@/types";
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

export interface ReportListResponse {
  reports: GeneratedReport[];
  total: number;
}

export function fetchReports(viewerId?: string): Promise<ApiResult<ReportListResponse>> {
  const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  return requestJson(`/api/reports${query}`);
}

export interface ReportDetailResponse {
  report: GeneratedReport;
  document: ReportDocument;
  accessibility: ReportAccessibility;
}

export function fetchReport(id: string, viewerId?: string): Promise<ApiResult<ReportDetailResponse>> {
  const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  return requestJson(`/api/reports/${id}${query}`);
}

export interface ScopeCountResponse {
  rowCount: number;
  large: boolean;
  /** Human-readable description of the scope, e.g. the product name. */
  label: string;
}

/** How many records a scope covers, for the zero-record block and large-scope warning. */
export function fetchScopeCount(
  scope: ReportScope,
  viewerId?: string
): Promise<ApiResult<ScopeCountResponse>> {
  return postJson("/api/reports/scope", { scope, ...(viewerId ? { viewerId } : {}) });
}

export interface GenerateReportParams {
  scope: ReportScope;
  /**
   * Plural on purpose. Format selection is a genuine multi-select (10 §5),
   * and `GeneratedReport.formats` is an array — an earlier singular `format`
   * here disagreed with both.
   */
  formats: ReportFormat[];
  userId: string;
  userName: string;
  forceFailStage?: ReportStageId;
}

export interface GenerateReportResponse {
  run?: ReportRun;
  /** Populated instead of `run` when generation refused to start. */
  blocked?: ReportBlockReason;
  rowCount: number;
}

export function generateReport(
  params: GenerateReportParams
): Promise<ApiResult<GenerateReportResponse>> {
  return postJson("/api/reports/generate", params);
}

export function pollReportRun(runId: string): Promise<ApiResult<ReportRun>> {
  return requestJson(`/api/reports/runs/${runId}`);
}

export function retryReportStage(
  runId: string,
  stageId: ReportStageId
): Promise<ApiResult<ReportRun>> {
  return postJson(`/api/reports/runs/${runId}/retry/${stageId}`, {});
}

/**
 * The download link for one format. A plain href rather than a fetch — the
 * route sets `Content-Disposition`, so the browser handles the save and no
 * blob juggling is needed on the client.
 */
export function reportDownloadHref(
  reportId: string,
  format: ReportFormat,
  viewerId?: string
): string {
  const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  return `/api/reports/${reportId}/download/${format.toLowerCase()}${query}`;
}
