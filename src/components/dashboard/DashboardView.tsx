"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { RegionalDistributionTable } from "@/components/analytics/RegionalDistributionTable";
import { AlertsPanel, KpiRow, QuickActions, RecentScansTable, TrendPanel } from "@/components/dashboard";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useDashboardData } from "@/lib/hooks";
import { COMPLIANCE_STATUSES, SOURCE_TAGS } from "@/types";

function widgetDemoState(demo: string | null, widget: "trend" | "recentScans" | "alerts") {
  if (demo === "loading" || demo === "empty") return demo;
  return demo === `${widget}-error` ? "error" : undefined;
}

/** Client-composed, viewer-aware Dashboard, following the RecordsView pattern. */
export function DashboardView({ locale }: { locale: string }) {
  const t = useTranslations();
  const td = useTranslations("dashboard");
  const ta = useTranslations("analytics");
  const demo = useSearchParams().get("demo");
  const { data, loading, error } = useDashboardData();
  const trendState = widgetDemoState(demo, "trend") ?? (error ? "error" : undefined);
  const recentState = widgetDemoState(demo, "recentScans") ?? (error ? "error" : undefined);
  const alertsState = widgetDemoState(demo, "alerts") ?? (error ? "error" : undefined);
  const statusLabels = Object.fromEntries(COMPLIANCE_STATUSES.map((status) => [status, t(`vocabulary.complianceStatus.${status}`)])) as Record<(typeof COMPLIANCE_STATUSES)[number], string>;
  const sourceLabels = Object.fromEntries(SOURCE_TAGS.map((source) => [source, t(`vocabulary.sourceTag.${source}`)])) as Record<(typeof SOURCE_TAGS)[number], string>;

  return <div className="lmcs-page-section">
    <section aria-labelledby="kpi-heading" className="ux4g-mb-xl">
      <h2 id="kpi-heading" className="ux4g-sr-only">{td("kpis.heading")}</h2>
      <KpiRow kpis={data?.kpis ?? []} locale={locale} loading={loading || demo === "loading"} labels={{ productsScanned: td("kpis.productsScanned"), compliant: td("kpis.compliant"), nonCompliant: td("kpis.nonCompliant"), pending: td("kpis.pending"), pendingCaption: td("kpis.pendingCaption") }} />
    </section>

    {data?.regionalDistribution.length ? <section aria-labelledby="regional-distribution-heading" className="ux4g-card ux4g-card-outline ux4g-mb-xl">
      <div className="ux4g-card-body lmcs-page-section-block">
        <h2 id="regional-distribution-heading" className="ux4g-title-m-strong">{ta("regionalDistribution.heading")}</h2>
        <RegionalDistributionTable data={data.regionalDistribution} labels={{ caption: ta("regionalDistribution.heading"), columnRegion: ta("regionalDistribution.columnRegion"), columnTotalScanned: ta("regionalDistribution.columnTotalScanned"), columnNonCompliant: ta("regionalDistribution.columnNonCompliant"), columnRate: ta("regionalDistribution.columnRate"), columnAction: ta("regionalDistribution.columnAction"), view: ta("regionalDistribution.view") }} />
      </div>
    </section> : null}

    <section aria-labelledby="trend-heading" className="ux4g-mb-xl">
      <h2 id="trend-heading" className="ux4g-sr-only">{td("trend.heading")}</h2>
      <TrendPanel {...(data ? { dataByPeriod: data.trends } : {})} labels={{ heading: td("trend.heading"), weekly: td("trend.weekly"), monthly: td("trend.monthly"), compliantSeries: td("trend.compliantSeries"), nonCompliantSeries: td("trend.nonCompliantSeries"), totalScansSeries: td("trend.totalScansSeries"), dateColumn: td("trend.dateColumn"), notEnoughData: td("trend.notEnoughData"), loading: td("trend.loading"), errorTitle: td("trend.errorTitle"), errorBody: td("trend.errorBody"), retryLabel: t("common.actions.retry") }} {...(trendState ? { demoState: trendState } : {})} />
    </section>

    <section aria-labelledby="recent-scans-heading" className="ux4g-mb-xl">
      <div className="lmcs-dashboard-section-head ux4g-mb-m"><h2 id="recent-scans-heading" className="ux4g-heading-m-strong">{td("recentScans.heading")}</h2><Link href={ROUTES.records} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">{td("recentScans.viewAll")}</Link></div>
      <RecentScansTable records={data?.recentScans ?? []} locale={locale} labels={{ columnProduct: td("recentScans.columnProduct"), columnDate: td("recentScans.columnDate"), columnStatus: td("recentScans.columnStatus"), columnSource: td("recentScans.columnSource"), columnAction: td("recentScans.columnAction"), caption: td("recentScans.caption"), emptyTitle: td("recentScans.emptyTitle"), emptyBody: td("recentScans.emptyBody"), emptyAction: td("recentScans.emptyAction"), errorTitle: td("recentScans.errorTitle"), errorBody: td("recentScans.errorBody"), retryLabel: t("common.actions.retry"), viewLabel: t("common.actions.view"), statusLabels, sourceLabels }} {...(recentState ? { demoState: recentState } : {})} />
    </section>

    <section aria-labelledby="alerts-heading" className="ux4g-mb-xl"><h2 id="alerts-heading" className="ux4g-sr-only">{td("alerts.heading")}</h2>
      <AlertsPanel alerts={data?.alerts ?? []} labels={{ heading: td("alerts.heading"), emptyTitle: td("alerts.emptyTitle"), emptyBody: td("alerts.emptyBody"), errorTitle: td("alerts.errorTitle"), errorBody: td("alerts.errorBody"), retryLabel: t("common.actions.retry"), viewAction: td("alerts.viewAction") }} {...(alertsState ? { demoState: alertsState } : {})} />
    </section>

    <section aria-labelledby="quick-actions-heading"><h2 id="quick-actions-heading" className="ux4g-heading-m-strong ux4g-mb-m">{td("quickActions.heading")}</h2>
      <QuickActions labels={{ scanNewProduct: td("quickActions.scanNewProduct"), scanEcommerceListing: td("quickActions.scanEcommerceListing"), viewRecords: td("quickActions.viewRecords"), generateReport: td("quickActions.generateReport") }} />
    </section>
  </div>;
}
