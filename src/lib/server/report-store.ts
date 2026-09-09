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
import { findMockUser } from "@/lib/mock/users";
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
  scopeRecordsForViewer,
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

/** Test-only seam, mirroring the other stores' `resetXForTests`. */
export function resetReportStoreForTests(): void {
  runs.clear();
  reports.clear();
  seeded = false;
  sequence = 6000;
}

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
export function resolveScopeRecords(scope: ReportScope, viewerId?: string): ComplianceRecord[] {
  if (scope.kind === "record") {
    const record = getRecordById(scope.recordId);
    return record ? scopeRecordsForViewer([record], viewerId) : [];
  }

  if (scope.kind === "manufacturer") {
    return computeManufacturerScorecard(scope.manufacturerId, viewerId)?.products ?? [];
  }

  return listRecords(scope.filters, "newest", 1, MAX_SCOPE_ROWS, viewerId).rows;
}

/** Row count for the large-scope warning, without building the report. */
export function countScopeRows(scope: ReportScope, viewerId?: string): number {
  return resolveScopeRecords(scope, viewerId).length;
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
    const name = records[0]?.manufacturerName;
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
        recordIds: run.recordIds,
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
  /** Viewer identity constrains the report's resolved record set. */
  viewerId?: string;
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

  const records = resolveScopeRecords(input.scope, input.viewerId);

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

/**
 * Test-only: forces a run straight to its terminal stage, the same reason
 * `completePipelineRunNow` exists in scan-pipeline-store.ts — a synchronous
 * test cannot wait out the real 600+1100+400ms of elapsed-time stage
 * durations. Backdates the current stage's start on each pass so
 * `withAdvancedReportStages` sees it as elapsed and completes it; repeated
 * once per stage, since a freshly-started next stage always begins at the
 * real "now" and needs its own backdated pass.
 */
export function completeReportRunNowForTests(runId: string): ReportRun | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  const longAgo = new Date(Date.now() - 100_000).toISOString();
  for (let i = 0; i < run.stages.length && !run.report; i++) {
    run.currentStageStartedAt = longAgo;
    withAdvancedReportStages(run);
  }
  return toPublicRun(run);
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
 * ------------------------------------------------------------------ *
 * Reports are legal/compliance artifacts (13 §4 plan's immutability
 * invariant): a report's scope, row count, and rendered content are facts
 * fixed at generation time and must not depend on who reads them later or
 * when. `rowCount` and `recordIds` on `GeneratedReport` are written once,
 * in `withAdvancedReportStages`'s finalising branch, and nothing below
 * this point ever overwrites them.
 *
 * "Viewer-aware authorization" is a genuinely separate question from that
 * — whether a given viewer may see this report at all — and is answered
 * without touching the report's own data. A viewer may see a report if
 * they generated it, or if at least one of the report's original,
 * frozen `recordIds` is still visible to them today under the ordinary
 * jurisdiction-scoping rule. This deliberately does not re-resolve
 * `report.scope` against current data for this check — doing that would
 * reintroduce the exact drift this fix removes, since a filtered scope
 * re-resolved "now" can match a different set of records than it did at
 * generation time.
 */
function isReportVisibleTo(report: GeneratedReport, viewerId?: string): boolean {
  if (!viewerId) return true;
  if (report.generatedByUserId === viewerId) return true;
  if (!findMockUser(viewerId)) return true;

  const frozenRecords = report.recordIds
    .map((id) => getRecordById(id))
    .filter((record): record is ComplianceRecord => record !== undefined);
  return scopeRecordsForViewer(frozenRecords, viewerId).length > 0;
}

export function listReports(viewerId?: string): GeneratedReport[] {
  ensureSeeded();
  return [...reports.values()]
    .filter((report) => isReportVisibleTo(report, viewerId))
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
}

/**
 * A known report the viewer cannot see is reported as blocked, not
 * missing — the same 404-vs-403 shape `resolveManufacturerScorecardForViewer`
 * already uses, so a route can translate `blocked` to 403 without
 * disclosing that the report exists to a viewer who should not see it.
 */
export function getReportForViewer(
  reportId: string,
  viewerId?: string
): { report?: GeneratedReport; blocked: boolean } {
  ensureSeeded();
  const report = reports.get(reportId);
  if (!report) return { blocked: false };
  if (!isReportVisibleTo(report, viewerId)) return { blocked: true };
  return { report, blocked: false };
}

/**
 * Resolves a report's content for rendering (detail/preview/download).
 * Always re-derived from the frozen scope as of *now* — a later
 * correction to one of the covered records should show up on re-download,
 * which is `report-store.ts`'s pre-existing, documented trade-off — but
 * always through the *generating* user's own visibility, never the
 * current reader's. Without this, the same report id would render
 * different content to different readers, which is a second, independent
 * way the immutability invariant was broken: a report's content is one of
 * the things that "must remain stable" regardless of who downloads it.
 */
export function resolveReportContentRecords(report: GeneratedReport): ComplianceRecord[] {
  return resolveScopeRecords(report.scope, report.generatedByUserId);
}

/** Resolves a printed reference code back to its report — what the QR is for. */
export function findReportByReferenceCode(code: string): GeneratedReport | undefined {
  ensureSeeded();
  return [...reports.values()].find(
    (report) => report.referenceCode.toLowerCase() === code.toLowerCase()
  );
}
