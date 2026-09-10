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

import { API } from "@/lib/constants";
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
import { apiGet, apiPost } from "./client";
import type { ApiResult } from "./client";

/**
 * Phase 5: record-scope reports (ReportScope.kind === "record") are real —
 * generated and stored by the FastAPI backend, immutable, never re-rendered
 * on download. Manufacturer/filtered scopes stay on the mock route below
 * (outside the Report DB model's own documented MVP scope). Each exported
 * function below branches on `scope.kind` right at the top, so the existing
 * UI (ReportsView/DownloadHistoryTable/ReportPreview, the polling effect in
 * useReports.ts) needs zero changes — only this module knows the real
 * backend exists.
 */

interface RecordReportSummary {
  id: string;
  complianceRecordId: string;
  referenceCode: string;
  generatedAt: string;
  generatedBy: string | null;
  formats: string[];
}

function terminalRun(report: RecordReportSummary, generated: GeneratedReport): ReportRun {
  return {
    id: report.id,
    status: "completed",
    stages: [
      { id: "collecting", state: "completed" },
      { id: "rendering", state: "completed" },
      { id: "finalising", state: "completed" },
    ],
    report: generated,
  };
}

function toGeneratedReport(
  report: RecordReportSummary,
  scope: Extract<ReportScope, { kind: "record" }>,
  userId: string,
  userName: string
): GeneratedReport {
  return {
    id: report.id,
    name: `Report — ${report.referenceCode.slice(0, 8)}`,
    scope,
    formats: report.formats.map((f) => f.toUpperCase()) as ReportFormat[],
    generatedAt: report.generatedAt,
    generatedByUserId: report.generatedBy ?? userId,
    generatedByUserName: userName,
    referenceCode: report.referenceCode,
    rowCount: 1,
    recordIds: [scope.recordId],
  };
}

/**
 * Real backend Report ids are DB-generated UUIDs; every mock fixture/route
 * handler id in this app uses the "rpt-NNNN" convention instead. Download
 * History mixes both real and mock reports in one list — `scope.kind` alone
 * isn't enough to tell them apart, since a pre-existing MOCK record-scope
 * report (scope: {kind: "record", ...}) also has scope.kind === "record"
 * and would otherwise be routed at the real backend and 404.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRealBackendReportId(id: string): boolean {
  return UUID_RE.test(id);
}

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("lmcs-token");
}

const REAL_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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

/**
 * `scope` disambiguates a real backend report id from a mock one — a plain
 * numeric `id` has no scope of its own to branch on. Record-scope reports
 * (the only real ones — see this file's own top comment) reach here right
 * after `generateReport()` already knows the id is real, or from Download
 * History where the caller already has the full `GeneratedReport`.
 */
export async function fetchReport(
  id: string,
  viewerId?: string,
  scope?: ReportScope
): Promise<ApiResult<ReportDetailResponse>> {
  if (scope?.kind === "record") {
    const result = await apiGet<{ document: ReportDocument } & RecordReportSummary>(
      API.recordReports.detail(id)
    );
    if (!result.ok) return result;
    const generated = toGeneratedReport(result.data, scope, "", result.data.generatedBy ?? "");
    return {
      ok: true,
      data: {
        report: generated,
        document: result.data.document,
        accessibility: { pdfIsTagged: false },
      },
    };
  }
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
export async function fetchScopeCount(
  scope: ReportScope,
  viewerId?: string
): Promise<ApiResult<ScopeCountResponse>> {
  if (scope.kind === "record") {
    const result = await apiGet<{ productName: string }>(API.records.detail(scope.recordId));
    if (!result.ok) return result;
    return { ok: true, data: { rowCount: 1, large: false, label: result.data.productName } };
  }
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

/** Runs the generation SYNCHRONOUSLY for a real record-scope report (fast —
 * one record, no async job needed) and synthesizes an already-terminal
 * `ReportRun` — the existing 500ms polling effect in useReports.ts needs no
 * change, since it already no-ops once `status !== "generating"`. */
async function generateRecordReport(
  scope: Extract<ReportScope, { kind: "record" }>,
  userId: string,
  userName: string
): Promise<ApiResult<GenerateReportResponse>> {
  const result = await apiPost<RecordReportSummary>(API.recordReports.generate(scope.recordId), {});
  if (!result.ok) return result;
  const generated = toGeneratedReport(result.data, scope, userId, userName);
  return { ok: true, data: { run: terminalRun(result.data, generated), rowCount: 1 } };
}

export function generateReport(
  params: GenerateReportParams
): Promise<ApiResult<GenerateReportResponse>> {
  if (params.scope.kind === "record") {
    return generateRecordReport(params.scope, params.userId, params.userName);
  }
  return postJson("/api/reports/generate", params);
}

/** Real record-scope runs are already terminal (see generateRecordReport) — this only ever polls a mock run. */
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
 * blob juggling is needed on the client. Record-scope reports point
 * DIRECTLY at the real FastAPI backend with the session token as a query
 * param (`access_token`) — the anchor tag cannot attach an Authorization
 * header, and this UX is being kept unchanged deliberately (see this file's
 * top comment). A token in a URL is a real MVP tradeoff (browser history,
 * server logs) surfaced in the Phase 5 report, not hidden; a hardening pass
 * should replace it with a short-lived signed download ticket.
 */
export function reportDownloadHref(report: GeneratedReport, format: ReportFormat, viewerId?: string): string {
  if (report.scope.kind === "record" && isRealBackendReportId(report.id)) {
    const token = getSessionToken();
    const params = new URLSearchParams();
    if (token) params.set("access_token", token);
    return `${REAL_API_BASE}${API.recordReports.download(report.id, format.toLowerCase())}?${params.toString()}`;
  }
  const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  return `/api/reports/${report.id}/download/${format.toLowerCase()}${query}`;
}
