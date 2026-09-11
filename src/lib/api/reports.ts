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
  ReportGenerationStatus,
  ReportRun,
  ReportScope,
  ReportStage,
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
  referenceCode: string | null;
  generatedAt: string;
  generatedBy: string | null;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  currentStage: "collecting" | "rendering" | "finalising" | null;
  errorMessage: string | null;
  reportFormatVersion: string;
  formats: string[];
}

/**
 * Phase 13: `generate_report()`'s response no longer carries a real
 * `referenceCode` (that only exists once `build_report_snapshot()` runs
 * inside the async job) — a fresh PENDING row's summary has `referenceCode:
 * null`. `toGeneratedReport()` needs SOME string for `GeneratedReport.
 * referenceCode`/`.name` before that point, so it falls back to the report
 * id itself, which every caller already treats as opaque.
 */
function toGeneratedReport(
  report: RecordReportSummary,
  scope: Extract<ReportScope, { kind: "record" }>,
  userId: string,
  userName: string
): GeneratedReport {
  const reference = report.referenceCode ?? report.id;
  return {
    id: report.id,
    name: `Report — ${reference.slice(0, 8)}`,
    scope,
    formats: report.formats.map((f) => f.toUpperCase()) as ReportFormat[],
    generatedAt: report.generatedAt,
    generatedByUserId: report.generatedBy ?? userId,
    generatedByUserName: userName,
    referenceCode: reference,
    rowCount: 1,
    recordIds: [scope.recordId],
  };
}

/**
 * Maps the real backend's async lifecycle (`status`/`currentStage`/
 * `errorMessage`) onto the existing `ReportRun`/`ReportStage` shape
 * `ReportProgressTracker.tsx` already renders generically — the same
 * three-stage vocabulary (`REPORT_STAGE_IDS`) exists on both sides
 * specifically so no UI change is needed here, only this mapping.
 */
function mapBackendStatusToRun(
  report: RecordReportSummary,
  scope: Extract<ReportScope, { kind: "record" }>,
  userId: string,
  userName: string
): ReportRun {
  const stageOrder: ReportStageId[] = ["collecting", "rendering", "finalising"];
  const currentIndex = report.currentStage ? stageOrder.indexOf(report.currentStage) : -1;

  const status: ReportGenerationStatus =
    report.status === "COMPLETED" ? "completed" : report.status === "FAILED" ? "failed" : "generating";

  const stages: ReportStage[] = stageOrder.map((id, index) => {
    if (status === "completed") return { id, state: "completed" };
    if (status === "failed" && (currentIndex === -1 || index === currentIndex)) {
      return { id, state: "failed", failureReason: report.errorMessage ?? "Report generation failed." };
    }
    if (index < currentIndex) return { id, state: "completed" };
    if (index === currentIndex) return { id, state: "in_progress" };
    return { id, state: "pending" };
  });

  return {
    id: report.id,
    status,
    stages,
    ...(status === "completed" ? { report: toGeneratedReport(report, scope, userId, userName) } : {}),
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

/**
 * Phase 7 — a single record's own report history, from the real backend
 * (GET /reports/by-record/{id}, now officer-scope-checked). Distinct from
 * `fetchReports()` above, which is the mock global Download History list —
 * this is what Record Detail's own "Report history" section calls.
 */
export async function fetchReportsForRecord(
  recordId: string,
  userId: string,
  userName: string
): Promise<ApiResult<GeneratedReport[]>> {
  const result = await apiGet<RecordReportSummary[]>(API.recordReports.byRecord(recordId));
  if (!result.ok) return result;
  const scope: Extract<ReportScope, { kind: "record" }> = { kind: "record", recordId };
  return { ok: true, data: result.data.map((r) => toGeneratedReport(r, scope, userId, userName)) };
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

/**
 * Kicks off REAL async generation for a record-scope report: the backend
 * returns immediately with a PENDING row (202), and the returned `ReportRun`
 * starts with every stage `pending` — genuinely in flight, not a faked
 * terminal state. `useReports.ts`'s existing polling effect (already
 * generic on `run.status === "generating"`) picks it up from there with no
 * changes of its own.
 */
async function generateRecordReport(
  scope: Extract<ReportScope, { kind: "record" }>,
  userId: string,
  userName: string
): Promise<ApiResult<GenerateReportResponse>> {
  const result = await apiPost<RecordReportSummary>(API.recordReports.generate(scope.recordId), {});
  if (!result.ok) return result;
  return { ok: true, data: { run: mapBackendStatusToRun(result.data, scope, userId, userName), rowCount: 1 } };
}

export function generateReport(
  params: GenerateReportParams
): Promise<ApiResult<GenerateReportResponse>> {
  if (params.scope.kind === "record") {
    return generateRecordReport(params.scope, params.userId, params.userName);
  }
  return postJson("/api/reports/generate", params);
}

/**
 * `context` carries the display fields (`userId`/`userName`) needed to
 * build the eventual `GeneratedReport` once a real backend run completes —
 * `scope` itself is never needed as an input: `complianceRecordId` is
 * already on every backend response, so it's reconstructed from that
 * rather than threaded through the whole call chain. Optional and ignored
 * for mock (System B) runs, which stay on the unchanged mock route.
 */
export async function pollReportRun(
  runId: string,
  context?: { userId: string; userName: string }
): Promise<ApiResult<ReportRun>> {
  if (isRealBackendReportId(runId)) {
    const result = await apiGet<RecordReportSummary>(API.recordReports.detail(runId));
    if (!result.ok) return result;
    const scope: Extract<ReportScope, { kind: "record" }> = {
      kind: "record",
      recordId: result.data.complianceRecordId,
    };
    return {
      ok: true,
      data: mapBackendStatusToRun(result.data, scope, context?.userId ?? "", context?.userName ?? ""),
    };
  }
  return requestJson(`/api/reports/runs/${runId}`);
}

export async function retryReportStage(
  runId: string,
  stageId: ReportStageId,
  context?: { userId: string; userName: string }
): Promise<ApiResult<ReportRun>> {
  if (isRealBackendReportId(runId)) {
    const result = await apiPost<RecordReportSummary>(API.recordReports.retry(runId), {});
    if (!result.ok) return result;
    const scope: Extract<ReportScope, { kind: "record" }> = {
      kind: "record",
      recordId: result.data.complianceRecordId,
    };
    return {
      ok: true,
      data: mapBackendStatusToRun(result.data, scope, context?.userId ?? "", context?.userName ?? ""),
    };
  }
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
