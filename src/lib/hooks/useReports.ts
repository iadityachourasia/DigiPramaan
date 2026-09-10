"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  fetchReport,
  fetchReports,
  fetchScopeCount,
  generateReport,
  pollReportRun,
  retryReportStage as retryReportStageRequest,
  type ReportDetailResponse,
} from "@/lib/api/reports";
import {
  REPORT_STAGE_IDS,
  type ComplianceStatus,
  type GeneratedReport,
  type ProductCategory,
  type RecordFilters,
  type ReportBlockReason,
  type ReportFormat,
  type ReportRun,
  type ReportScope,
  type ReportStageId,
  type SourceTag,
  type ViolationCategoryId,
} from "@/types";
import { useAuth } from "./useAuth";

/** Report stages are ~1s apart, so this matches the pipeline tracker's cadence. */
const POLL_INTERVAL_MS = 500;

/* ------------------------------------------------------------------ *
 * Scope from the URL
 * ------------------------------------------------------------------ */

/**
 * The four arrival shapes page 10 accepts, one per `ReportScope` variant
 * plus the cold start:
 *
 *   ?recordId=<id>                        single record — records row,
 *                                         record detail, scorecard row
 *   ?type=scorecard&manufacturerId=<id>   one manufacturer — scorecard Export
 *   ?type=filtered&<RecordFilters params> a filtered set — Compliance Records
 *   (no params)                           cold start, user picks
 *
 * The filtered shape reuses the exact repeated-key convention
 * `useRecordsList` reads (`?regions=A&regions=B`), so a filter set survives
 * the hop from page 5 without a second serialisation format to keep in step.
 */
export function scopeFromParams(params: URLSearchParams): ReportScope | null {
  const recordId = params.get("recordId");
  if (recordId) return { kind: "record", recordId };

  const type = params.get("type");

  if (type === "scorecard") {
    const manufacturerId = params.get("manufacturerId");
    if (manufacturerId) return { kind: "manufacturer", manufacturerId };
    return null;
  }

  if (type === "filtered") {
    const filters: RecordFilters = {
      categories: params.getAll("categories") as ProductCategory[],
      complianceStatuses: params.getAll("complianceStatuses") as ComplianceStatus[],
      regions: params.getAll("regions"),
      manufacturers: params.getAll("manufacturers"),
      sources: params.getAll("sources") as SourceTag[],
      violationCategoryIds: params.getAll("violationCategoryIds") as ViolationCategoryId[],
      batchIds: params.getAll("batchIds"),
    };
    const query = params.get("query");
    if (query) filters.query = query;
    const dateFrom = params.get("dateFrom");
    if (dateFrom) filters.dateFrom = dateFrom;
    const dateTo = params.get("dateTo");
    if (dateTo) filters.dateTo = dateTo;
    return { kind: "filtered", filters };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Download History
 * ------------------------------------------------------------------ */

/**
 * useReportHistory — Download History (10 §2).
 *
 * Demo states are derived from the URL rather than written into state by an
 * effect, which is both more correct (a demo state is a function of the URL)
 * and what keeps `react-hooks/set-state-in-effect` satisfied.
 */
export function useReportHistory(demoState?: string, refreshKey = 0) {
  const { user } = useAuth();
  const [fetched, setFetched] = useState<GeneratedReport[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  const skipFetch = demoState === "loading" || demoState === "error";

  useEffect(() => {
    if (skipFetch) return;

    let cancelled = false;
    fetchReports(user?.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setFetched(result.data.reports);
      else setFetchFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [skipFetch, refreshKey, user?.id]);

  if (demoState === "error") return { reports: null, loading: false, error: true };
  if (demoState === "loading") return { reports: null, loading: true, error: false };
  if (demoState === "empty") {
    return { reports: [] as GeneratedReport[], loading: false, error: false };
  }

  return { reports: fetched, loading: !fetched && !fetchFailed, error: fetchFailed };
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

export interface UseReportBuilderResult {
  scope: ReportScope | null;
  setScope: (scope: ReportScope | null) => void;
  formats: ReportFormat[];
  toggleFormat: (format: ReportFormat) => void;
  rowCount: number | null;
  /** Human-readable scope description from the server, e.g. the product name. */
  scopeLabel: string | null;
  largeScope: boolean;
  warningDismissed: boolean;
  dismissWarning: () => void;
  run: ReportRun | null;
  detail: ReportDetailResponse | null;
  blocked: ReportBlockReason | null;
  requestError: boolean;
  generating: boolean;
  generate: (userId: string, userName: string) => Promise<void>;
  retryStage: (stageId: ReportStageId) => Promise<void>;
  reset: () => void;
}

/**
 * useReportBuilder — scope, formats, generation and preview for the Report
 * Builder (10 §2-§4).
 *
 * The scope is seeded from the URL once and then owned here, because the user
 * can adjust it after arriving (10 §3 step 2: "confirms or adjusts"). That
 * differs deliberately from `useRecordsList`, where the URL stays the single
 * source of truth because deep-linking a filter set is the whole point.
 */
export function useReportBuilder(): UseReportBuilderResult {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const demoParam = searchParams.get("demo");

  const initialScope = useMemo(
    () => scopeFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const [scopeOverride, setScopeOverride] = useState<ReportScope | null | undefined>(undefined);
  const scope = scopeOverride === undefined ? initialScope : scopeOverride;

  const [formats, setFormats] = useState<ReportFormat[]>(["PDF"]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [serverLarge, setServerLarge] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);

  const [run, setRun] = useState<ReportRun | null>(null);
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [blocked, setBlocked] = useState<ReportBlockReason | null>(null);
  const [requestError, setRequestError] = useState(false);
  const [generating, setGenerating] = useState(false);

  /*
   * `?demo=large-scope` forces the warning. Twelve seed records cannot reach a
   * hundred, so the state is otherwise unreachable in a demo — the same
   * accommodation page 7 made for a trend its record count cannot describe.
   *
   * It reshapes the reported count too, not just the flag. Forcing the flag
   * alone produced a warning that argued with itself ("covers 1 records,
   * above the 100-record threshold"), which is worse than not demoing the
   * state at all. This mirrors how page 9's `?demo=single-scan` reshapes the
   * real response rather than toggling a boolean beside it.
   */
  const DEMO_LARGE_ROW_COUNT = 247;
  const forcedLarge = demoParam === "large-scope";
  const largeScope = forcedLarge || serverLarge;
  const reportedRowCount = forcedLarge ? DEMO_LARGE_ROW_COUNT : rowCount;

  const scopeKey = scope ? JSON.stringify(scope) : "";

  useEffect(() => {
    if (!scope) return;

    let cancelled = false;
    fetchScopeCount(scope, user?.id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setRowCount(result.data.rowCount);
        setServerLarge(result.data.large);
        setScopeLabel(result.data.label);
      }
    });
    return () => {
      cancelled = true;
    };
    // `scopeKey` is the stable identity of `scope`, which is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, user?.id]);

  /** Poll an in-flight run until it settles. */
  useEffect(() => {
    if (!run || run.status !== "generating") return;

    const interval = setInterval(() => {
      pollReportRun(run.id).then((result) => {
        if (result.ok) setRun(result.data);
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [run]);

  /** Once the run completes, fetch the assembled document for the preview. */
  const completedReportId = run?.status === "completed" ? run.report?.id : undefined;

  useEffect(() => {
    if (!completedReportId) return;

    let cancelled = false;
    fetchReport(completedReportId, user?.id, scope ?? undefined).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetail(result.data);
      else setRequestError(true);
    });
    return () => {
      cancelled = true;
    };
    // `scopeKey` is the stable identity of `scope`, which is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedReportId, user?.id, scopeKey]);

  const setScope = useCallback((next: ReportScope | null) => {
    setScopeOverride(next);
    setRun(null);
    setDetail(null);
    setBlocked(null);
    setRowCount(null);
    setScopeLabel(null);
    setServerLarge(false);
    setWarningDismissed(false);
  }, []);

  const toggleFormat = useCallback((format: ReportFormat) => {
    setFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
  }, []);

  const generate = useCallback(
    async (userId: string, userName: string) => {
      if (!scope) {
        setBlocked("zero-records");
        return;
      }

      setGenerating(true);
      setBlocked(null);
      setRequestError(false);
      setDetail(null);

      const forceFailStage = REPORT_STAGE_IDS.find(
        (stageId) => demoParam === `report-fail-${stageId}`
      );

      const result = await generateReport({
        scope,
        formats,
        userId,
        userName,
        ...(forceFailStage ? { forceFailStage } : {}),
      });
      setGenerating(false);

      if (!result.ok) {
        setRequestError(true);
        return;
      }
      if (result.data.blocked) {
        setBlocked(result.data.blocked);
        setRowCount(result.data.rowCount);
        return;
      }
      setRun(result.data.run ?? null);
    },
    [scope, formats, demoParam]
  );

  const retryStage = useCallback(
    async (stageId: ReportStageId) => {
      if (!run) return;
      const result = await retryReportStageRequest(run.id, stageId);
      if (result.ok) setRun(result.data);
      else setRequestError(true);
    },
    [run]
  );

  const reset = useCallback(() => {
    setRun(null);
    setDetail(null);
    setBlocked(null);
    setRequestError(false);
  }, []);

  return {
    scope,
    setScope,
    formats,
    toggleFormat,
    rowCount: reportedRowCount,
    scopeLabel,
    largeScope,
    warningDismissed,
    dismissWarning: () => setWarningDismissed(true),
    run,
    detail,
    blocked,
    requestError,
    generating,
    generate,
    retryStage,
    reset,
  };
}
