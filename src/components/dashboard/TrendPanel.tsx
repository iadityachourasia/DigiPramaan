"use client";

import { useState } from "react";

import { EmptyState, ErrorState, Skeleton } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { getTrendForPeriod } from "@/lib/mock";
import type { TrendPeriod, TrendPoint } from "@/types";

import { ComplianceTrendChart } from "./ComplianceTrendChart";

/**
 * TrendPanel — the compliance trend chart plus its weekly/monthly toggle.
 *
 * A client component because the toggle needs interactive state; the chart it
 * renders is likewise client-only (recharts requires the DOM). Everything
 * else on the Dashboard stays a server component.
 *
 * `demoState` is temporary scaffolding (see the Dashboard page's own comment)
 * for exercising the loading/empty/error states this widget is required to
 * have independently of the rest of the page — remove the prop once
 * `src/lib/api/analytics.ts` makes a real call that can genuinely fail.
 */

export interface TrendPanelProps {
  labels: {
    heading: string;
    weekly: string;
    monthly: string;
    compliantSeries: string;
    nonCompliantSeries: string;
    totalScansSeries: string;
    dateColumn: string;
    notEnoughData: string;
    loading: string;
    errorTitle: string;
    errorBody: string;
    retryLabel: string;
  };
  demoState?: "loading" | "empty" | "error";
  /** Dashboard's live, viewer-scoped series. Analytics retains its fixture fallback. */
  dataByPeriod?: Record<TrendPeriod, TrendPoint[]>;
  /** Analytics & Violation Trends' (page 7) drill-down — unused by Dashboard's own usage. */
  onPointClick?: (point: TrendPoint, series: "compliant" | "nonCompliant") => void;
  /**
   * Standard controlled/uncontrolled split: omit both to let this panel own
   * its own weekly/monthly state (Dashboard's usage). Analytics (page 7)
   * passes both — its drill-down handler needs to know which bucket width
   * a clicked point belongs to, so the period has to live in the parent
   * rather than only inside this panel.
   */
  period?: TrendPeriod;
  onPeriodChange?: (period: TrendPeriod) => void;
}

const MIN_POINTS_FOR_TREND = 2;

export function TrendPanel({
  labels,
  demoState,
  dataByPeriod,
  onPointClick,
  period: controlledPeriod,
  onPeriodChange,
}: TrendPanelProps) {
  const [internalPeriod, setInternalPeriod] = useState<TrendPeriod>("weekly");
  const period = controlledPeriod ?? internalPeriod;
  const setPeriod = (next: TrendPeriod) => {
    onPeriodChange?.(next);
    if (controlledPeriod === undefined) setInternalPeriod(next);
  };
  const data = demoState === "empty" ? [] : (dataByPeriod?.[period] ?? getTrendForPeriod(period));

  return (
    <div className="ux4g-card ux4g-card-outline">
      <div className="ux4g-card-body lmcs-dashboard-section">
        <div className="lmcs-dashboard-section-head">
          <h2 className="ux4g-title-m-strong">{labels.heading}</h2>

          {/*
            A pair of buttons, not a switch: this is a choice between two named
            options, not an on/off toggle, so ux4g-btn-outline-primary's
            pressed state is the right primitive rather than ux4g-switch —
            which would also trip Control/Track/Off's known-failing contrast
            (ACCESSIBILITY_AND_QA.md §1) for no benefit here. There is no
            ux4g-btn-group class in the package, so this pairing is a plain
            flex row using the same gap token as the rest of the shell.
          */}
          <div className="lmcs-trend-toggle" role="group" aria-label={labels.heading}>
            <button
              type="button"
              className={`ux4g-btn ux4g-btn-sm ${
                period === "weekly" ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"
              }`}
              aria-pressed={period === "weekly"}
              onClick={() => setPeriod("weekly")}
            >
              {labels.weekly}
            </button>
            <button
              type="button"
              className={`ux4g-btn ux4g-btn-sm ${
                period === "monthly" ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"
              }`}
              aria-pressed={period === "monthly"}
              onClick={() => setPeriod("monthly")}
            >
              {labels.monthly}
            </button>
          </div>
        </div>

        {demoState === "loading" ? (
          <Skeleton height="var(--lmcs-chart-height)" />
        ) : demoState === "error" ? (
          <ErrorState
            title={labels.errorTitle}
            description={labels.errorBody}
            action={
              <Link
                href={ROUTES.dashboard}
                className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
              >
                {labels.retryLabel}
              </Link>
            }
          />
        ) : data.length < MIN_POINTS_FOR_TREND ? (
          <EmptyState icon="show_chart" title={labels.notEnoughData} />
        ) : (
          <ComplianceTrendChart
            data={data}
            labels={{
              compliant: labels.compliantSeries,
              nonCompliant: labels.nonCompliantSeries,
              totalScans: labels.totalScansSeries,
              heading: labels.heading,
              dateColumn: labels.dateColumn,
            }}
            {...(onPointClick ? { onPointClick } : {})}
          />
        )}
      </div>
    </div>
  );
}
