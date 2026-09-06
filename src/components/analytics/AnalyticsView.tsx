"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { TrendPanel } from "@/components/dashboard/TrendPanel";
import { EmptyState, ErrorState, MetricCard, Skeleton } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Link, useRouter } from "@/i18n/navigation";
import { useAnalyticsData } from "@/lib/hooks";
import { ROUTES } from "@/lib/constants";
import { formatCompactNumber } from "@/lib/utils/format";
import type { ComplianceStatus, ProductCategory, TrendPeriod, TrendPoint, ViolationCategoryId } from "@/types";

import { CategoryAnalysisChart } from "./CategoryAnalysisChart";
import { RegionalDistributionTable } from "./RegionalDistributionTable";
import { ViolationBreakdownChart } from "./ViolationBreakdownChart";

/** A weekly point's own date is its bucket's first day; a monthly point's is the 1st of its month. */
function trendBucketRange(date: string, period: TrendPeriod): { dateFrom: string; dateTo: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  if (period === "weekly") {
    end.setDate(end.getDate() + 6);
  } else {
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(start), dateTo: iso(end) };
}

function recordsHref(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${ROUTES.records}?${query.toString()}`;
}

/**
 * AnalyticsView — client orchestrator for Analytics & Violation Trends
 * (page 7). No filter/period URL state for the page itself (see
 * `useAnalyticsData`'s own doc comment) — a single fetch on mount, each
 * section rendering its own loading/error/empty state.
 */
export function AnalyticsView({ locale }: { locale: string }) {
  const t = useTranslations("analytics");
  const tVocab = useTranslations("vocabulary");
  const router = useRouter();
  const { data, loading, error } = useAnalyticsData();
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("weekly");

  function handleTrendPointClick(point: TrendPoint, series: "compliant" | "nonCompliant") {
    const { dateFrom, dateTo } = trendBucketRange(point.date, trendPeriod);
    router.push(
      recordsHref({
        dateFrom,
        dateTo,
        complianceStatuses: series === "compliant" ? "Compliant" : "Non-Compliant",
      })
    );
  }

  function violationHref(categoryId: ViolationCategoryId): string {
    return recordsHref({ violationCategoryIds: categoryId });
  }

  function categoryHref(category: ProductCategory, status: ComplianceStatus): string {
    return recordsHref({ categories: category, complianceStatuses: status });
  }

  if (error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <Link href={ROUTES.analytics} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
            {t("retryLabel")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="lmcs-page-section">
      {/* Summary */}
      <div className="lmcs-kpi-grid">
        {loading || !data ? (
          <>
            <Skeleton height="6rem" />
            <Skeleton height="6rem" />
            <Skeleton height="6rem" />
          </>
        ) : (
          <>
            <MetricCard
              label={t("summary.totalScanned")}
              value={formatCompactNumber(data.summary.totalScanned, locale)}
              href={ROUTES.records}
            />
            <MetricCard
              label={t("summary.complianceRate")}
              value={`${data.summary.complianceRatePercentage}%`}
            />
            <MetricCard
              label={t("summary.processingSuccessRate")}
              value={`${data.summary.processingSuccessRatePercentage}%`}
            />
          </>
        )}
      </div>

      {/* Time Trends */}
      <TrendPanel
        labels={{
          heading: t("trend.heading"),
          weekly: t("trend.weekly"),
          monthly: t("trend.monthly"),
          compliantSeries: t("trend.compliantSeries"),
          nonCompliantSeries: t("trend.nonCompliantSeries"),
          totalScansSeries: t("trend.totalScansSeries"),
          dateColumn: t("trend.dateColumn"),
          notEnoughData: t("trend.notEnoughData"),
          loading: t("trend.loading"),
          errorTitle: t("trend.errorTitle"),
          errorBody: t("trend.errorBody"),
          retryLabel: t("retryLabel"),
        }}
        onPointClick={handleTrendPointClick}
        period={trendPeriod}
        onPeriodChange={setTrendPeriod}
      />

      {/* Violation-Type Breakdown */}
      <section aria-labelledby="violation-breakdown-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="violation-breakdown-heading" className="ux4g-title-m-strong">
            {t("violationBreakdown.heading")}
          </h2>
          {loading || !data ? (
            <Skeleton height="var(--lmcs-chart-height)" />
          ) : (
            <ViolationBreakdownChart
              data={data.violationBreakdown}
              onBarClick={(categoryId) => {
                router.push(violationHref(categoryId));
              }}
              labels={{
                heading: t("violationBreakdown.heading"),
                countColumn: t("violationBreakdown.countColumn"),
                categoryColumn: t("violationBreakdown.categoryColumn"),
              }}
            />
          )}
        </div>
      </section>

      {/* Category Analysis */}
      <section aria-labelledby="category-analysis-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="category-analysis-heading" className="ux4g-title-m-strong">
            {t("categoryAnalysis.heading")}
          </h2>
          {loading || !data ? (
            <Skeleton height="var(--lmcs-chart-height)" />
          ) : (
            <CategoryAnalysisChart
              data={data.categoryBreakdown}
              onBarClick={(category, status) => {
                router.push(categoryHref(category, status));
              }}
              labels={{
                heading: t("categoryAnalysis.heading"),
                categoryColumn: t("categoryAnalysis.categoryColumn"),
                compliantSeries: t("trend.compliantSeries"),
                nonCompliantSeries: t("trend.nonCompliantSeries"),
              }}
            />
          )}
        </div>
      </section>

      {/* Regional Distribution */}
      <section aria-labelledby="regional-distribution-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="regional-distribution-heading" className="ux4g-title-m-strong">
            {t("regionalDistribution.heading")}
          </h2>
          {loading || !data ? (
            <Skeleton height="12rem" />
          ) : (
            <RegionalDistributionTable
              data={data.regionBreakdown}
              labels={{
                caption: t("regionalDistribution.heading"),
                columnRegion: t("regionalDistribution.columnRegion"),
                columnTotalScanned: t("regionalDistribution.columnTotalScanned"),
                columnNonCompliant: t("regionalDistribution.columnNonCompliant"),
                columnRate: t("regionalDistribution.columnRate"),
                columnAction: t("regionalDistribution.columnAction"),
                view: t("regionalDistribution.view"),
              }}
            />
          )}
        </div>
      </section>

      {/* Source Breakdown */}
      <section aria-labelledby="source-breakdown-heading">
        <h2 id="source-breakdown-heading" className="ux4g-title-m-strong ux4g-mb-m">
          {t("sourceBreakdown.heading")}
        </h2>
        <div className="lmcs-kpi-grid">
          {loading || !data ? (
            <>
              <Skeleton height="6rem" />
              <Skeleton height="6rem" />
              <Skeleton height="6rem" />
            </>
          ) : (
            data.sourceBreakdown.map((entry) => (
              <MetricCard
                key={entry.source}
                label={tVocab(`sourceTag.${entry.source}`)}
                value={formatCompactNumber(entry.count, locale)}
                href={recordsHref({ sources: entry.source })}
              />
            ))
          )}
        </div>
      </section>

      {/* Anomaly / Hotspot Alerts */}
      <section aria-labelledby="anomalies-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="anomalies-heading" className="ux4g-title-m-strong">
            {t("anomalies.heading")}
          </h2>
          {loading || !data ? (
            <Skeleton height="4rem" />
          ) : data.anomalies.length === 0 ? (
            <EmptyState icon="check_circle" title={t("anomalies.emptyTitle")} />
          ) : (
            <div className="lmcs-alerts-list">
              {data.anomalies.map((anomaly) => (
                <Alert
                  key={anomaly.id}
                  severity={anomaly.severity}
                  title={anomaly.title}
                  actions={
                    <Link
                      href={anomaly.href}
                      className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                      aria-label={`${t("anomalies.view")}: ${anomaly.title}`}
                    >
                      {t("anomalies.view")}
                    </Link>
                  }
                >
                  {anomaly.description}
                </Alert>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
