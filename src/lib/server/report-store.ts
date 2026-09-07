/**
 * report-store.ts — server-side state for Reports & Profile (page 10).
 *
 * ITS OWN MODULE, LIKE ecommerce-store.ts
 * ----------------------------------------
 * A report is keyed by report id, has its own lifecycle, and needs none of
 * the scan pipeline's stage machinery beyond the shape of its progress
 * model. Folding it into the already-large scan-pipeline-store would mix two
 * unrelated key spaces; page 8 set the precedent for a sibling store.
 *
 * TIME-DERIVED PROGRESS, SAME AS THE PIPELINE
 * --------------------------------------------
 * `withAdvancedReportStages()` derives how far a generation run has got from
 * `currentStageStartedAt` + `Date.now()` on every read, rather than a
 * `setTimeout` chain. A poll after a long gap fast-forwards correctly, and
 * nothing has to survive a module reload.
 *
 * GENERATED FILES ARE NEVER STORED
 * ---------------------------------
 * Only the `GeneratedReport` metadata lives here. The download route
 * re-renders from the stored `scope` on every request, which is why
 * re-download works indefinitely without a file store, an expiry policy, or
 * the dead `/api/reports/rpt-5001.pdf` URLs the fixtures used to carry. The
 * user never sees a second progress run, so from their side this is still
 * 10 §6's "re-download without regeneration".
 */

import { MOCK_REPORTS } from "@/lib/mock/reports";
import {
  LARGE_REPORT_ROW_THRESHOLD,
  REPORT_STAGE_IDS,
  type ComplianceRecord,
  type GeneratedReport,
  type RecordFilters,
  type ReportBlockReason,
  type ReportFormat,
  type ReportRun,
  type ReportScope,
  type ReportStage,
  type ReportStageId,
} from "@/types";

import {
  computeManufacturerScorecard,
  getRecordById,
  listRecords,
  recordReportGenerated,
} from "./scan-pipeline-store";

/** Mock time per stage. Long enough that each transition reads as its own moment. */
const STAGE_DURATION_MS: Record<ReportStageId, number> = {
  collecting: 600,
  rendering: 1100,
  finalising: 400,
};

const FAILURE_REASON: Record<ReportStageId, string> = {
  collecting: "Could not read every record in this scope. Nothing was written.",
  rendering: "Document rendering failed partway through.",
  finalising: "Could not finalise the generated report.",
};

/** An upper bound on a filtered scope, so one report cannot try to page the world. */
const MAX_SCOPE_ROWS = 1000;

interface StoredReportRun {
  id: string;
  stages: ReportStage[];
  currentStageStartedAt: string;
  scope: ReportScope;
  formats: ReportFormat[];
  generatedByUserId: string;
  generatedByUserName: string;
  recordIds: string[];
  name: string;
  referenceCode: string;
  /** `?demo=report-fail-<stage>`. Consumed once, so a retry succeeds. */
  forceFailStage?: ReportStageId;
  /** Set when the run reaches its terminal stage. */
  report?: GeneratedReport;
  /** True once audit events are written, so a re-poll cannot double-write. */
  audited?: boolean;
}

const runs = new Map<string, StoredReportRun>();
const reports = new Map<string, GeneratedReport>();

let seeded = false;
let sequence = 6000;

/** Seeds Download History from the fixtures on first read, not at module load. */
function ensureSeeded(): void {
  if (seeded) return;
  for (const report of MOCK_REPORTS) reports.set(report.id, { ...report });
  seeded = true;
}

function nextId(): string {
  sequence += 1;
  return `rpt-${sequence}`;
}

/**
 * A short, human-readable code an officer can read off a printed page and
 * type back in. Stable once stored, and unambiguous enough for the demo.
 */
function makeReferenceCode(reportId: string): string {
  const suffix = Date.now().toString(16).slice(-4).toUpperCase();
  return `LMCS-${reportId.toUpperCase()}-${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Scope resolution
 * ------------------------------------------------------------------ */

/** An all-empty filter set, for a filtered scope arriving with no params at all. */
export const EMPTY_REPORT_FILTERS: RecordFilters = {
  categories: [],
  complianceStatuses: [],
  regions: [],
  manufacturers: [],
  sources: [],
  violationCategoryIds: [],
  batchIds: [],
};

/**
 * The records a scope covers. Every branch goes through the same live+static
 * merge pages 5, 7 and 9 read, so a report includes records created through
 * the pipeline rather than only the static seeds.
 */
export function resolveScopeRecords(scope: ReportScope): ComplianceRecord[] {
  if (scope.kind === "record") {
    const record = getRecordById(scope.recordId);
    return record ? [record] : [];
  }

  if (scope.kind === "manufacturer") {
    return computeManufacturerScorecard(scope.manufacturerId)?.products ?? [];
  }

  return listRecords(scope.filters, "newest", 1, MAX_SCOPE_ROWS).rows;
}

/** Row count for the large-scope warning, without building the report. */
export function countScopeRows(scope: ReportScope): number {
  return resolveScopeRecords(scope).length;
}

export function isLargeScope(rowCount: number): boolean {
  return rowCount > LARGE_REPORT_ROW_THRESHOLD;
}

/** Human-readable scope description, shown in Download History and on the document. */
export function describeScope(
  scope: ReportScope,
  records: readonly ComplianceRecord[]
): string {
  if (scope.kind === "record") {
    const record = records[0];
    return record
      ? `Compliance report — ${record.productName} (${record.scanId})`
      : "Compliance report";
  }

  if (scope.kind === "manufacturer") {
    const name = computeManufacturerScorecard(scope.manufacturerId)?.summary.name;
    return `Manufacturer scorecard — ${name ?? scope.manufacturerId}`;
  }

  const { filters } = scope;
  const parts: string[] = [];
  if (filters.complianceStatuses.length > 0) parts.push(filters.complianceStatuses.join(", "));
  if (filters.regions.length > 0) parts.push(filters.regions.join(", "));
  if (filters.manufacturers.length > 0) parts.push(filters.manufacturers.join(", "));
  if (filters.categories.length > 0) parts.push(filters.categories.join(", "));
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`${filters.dateFrom ?? "start"} to ${filters.dateTo ?? "today"}`);
  }

  return parts.length > 0
    ? `Compliance records — ${parts.join(" · ")}`
    : "Compliance records — all records";
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

function initialStages(): ReportStage[] {
  return REPORT_STAGE_IDS.map((id) => ({ id, state: "pending" as const }));
}

function stageSummary(run: StoredReportRun, stageId: ReportStageId): string {
  switch (stageId) {
    case "collecting":
      return `${run.recordIds.length} record${run.recordIds.length === 1 ? "" : "s"} collected.`;
    case "rendering":
      return `Rendered ${run.formats.join(" and ")}.`;
    case "finalising":
      return `Reference ${run.referenceCode}.`;
  }
}

/** Advances a run as far as elapsed time allows, stopping at a failure or an unelapsed stage. */
function withAdvancedReportStages(run: StoredReportRun): StoredReportRun {
  let progressed = true;

  while (progressed) {
    progressed = false;
    const index = run.stages.findIndex(
      (stage) => stage.state === "pending" || stage.state === "in_progress"
    );
    if (index === -1) break;
    const stage = run.stages[index]!;

    if (stage.state === "pending") {
      stage.state = "in_progress";
      run.currentStageStartedAt = new Date().toISOString();
      progressed = true;
      continue;
    }

    const elapsedMs = Date.now() - new Date(run.currentStageStartedAt).getTime();
    if (elapsedMs < STAGE_DURATION_MS[stage.id]) break;

    if (run.forceFailStage === stage.id) {
      stage.state = "failed";
      stage.failureReason = FAILURE_REASON[stage.id];
      delete run.forceFailStage;
      break;
    }

    stage.state = "completed";
    stage.summary = stageSummary(run, stage.id);

    if (stage.id === "finalising") {
      const report: GeneratedReport = {
        id: run.id,
        name: run.name,
        scope: run.scope,
        formats: run.formats,
        generatedAt: new Date().toISOString(),
        generatedByUserId: run.generatedByUserId,
        generatedByUserName: run.generatedByUserName,
        referenceCode: run.referenceCode,
        rowCount: run.recordIds.length,
      };
      run.report = report;
      reports.set(report.id, report);

      /*
       * The audit event lands only once the report actually exists — a run
       * that failed at rendering never claims a report was generated.
       * Guarded because this function runs on every poll.
       */
      if (!run.audited) {
        run.audited = true;
        recordReportGenerated(run.recordIds, run.generatedByUserId, run.name);
      }
    }

    progressed = true;
  }

  return run;
}

function runStatus(run: StoredReportRun): ReportRun["status"] {
  if (run.stages.some((stage) => stage.state === "failed")) return "failed";
  if (run.stages.every((stage) => stage.state === "completed")) return "completed";
  return "generating";
}

function toPublicRun(run: StoredReportRun): ReportRun {
  return {
    id: run.id,
    stages: run.stages.map((stage) => ({ ...stage })),
    status: runStatus(run),
    ...(run.report ? { report: run.report } : {}),
  };
}

export interface CreateReportRunInput {
  scope: ReportScope;
  formats: ReportFormat[];
  generatedByUserId: string;
  generatedByUserName: string;
  /** `?demo=report-fail-<stage>`. */
  forceFailStage?: ReportStageId;
}

export interface CreateReportRunResult {
  run?: ReportRun;
  /**
   * Set when generation refused to start. Returned with a 200 rather than an
   * error status, exactly as `verifyRecord` returns `blockedFields` — the
   * user is told precisely why instead of facing an inert button.
   */
  blocked?: ReportBlockReason;
  rowCount: number;
}

export function createReportRun(input: CreateReportRunInput): CreateReportRunResult {
  ensureSeeded();

  const records = resolveScopeRecords(input.scope);

  if (input.formats.length === 0) {
    return { blocked: "no-format", rowCount: records.length };
  }
  if (records.length === 0) {
    return { blocked: "zero-records", rowCount: 0 };
  }

  const id = nextId();
  const run: StoredReportRun = {
    id,
    stages: initialStages(),
    currentStageStartedAt: new Date().toISOString(),
    scope: input.scope,
    formats: input.formats,
    generatedByUserId: input.generatedByUserId,
    generatedByUserName: input.generatedByUserName,
    recordIds: records.map((record) => record.id),
    name: describeScope(input.scope, records),
    referenceCode: makeReferenceCode(id),
  };
  if (input.forceFailStage) run.forceFailStage = input.forceFailStage;

  runs.set(id, run);
  return { run: toPublicRun(withAdvancedReportStages(run)), rowCount: records.length };
}

export function getReportRun(runId: string): ReportRun | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  return toPublicRun(withAdvancedReportStages(run));
}

/** Retry a failed stage. Only a currently-failed stage is accepted. */
export function retryReportStage(
  runId: string,
  stageId: ReportStageId
): ReportRun | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  const stage = run.stages.find((s) => s.id === stageId);
  if (!stage || stage.state !== "failed") return undefined;

  stage.state = "in_progress";
  delete stage.failureReason;
  run.currentStageStartedAt = new Date().toISOString();
  return toPublicRun(withAdvancedReportStages(run));
}

/* ------------------------------------------------------------------ *
 * Download History
 * ------------------------------------------------------------------ */

export function listReports(): GeneratedReport[] {
  ensureSeeded();
  return [...reports.values()].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
}

export function getReport(reportId: string): GeneratedReport | undefined {
  ensureSeeded();
  return reports.get(reportId);
}

/** Resolves a printed reference code back to its report — what the QR is for. */
export function findReportByReferenceCode(code: string): GeneratedReport | undefined {
  ensureSeeded();
  return [...reports.values()].find(
    (report) => report.referenceCode.toLowerCase() === code.toLowerCase()
  );
}
