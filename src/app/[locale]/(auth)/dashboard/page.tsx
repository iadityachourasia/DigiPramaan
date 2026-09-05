import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import {
  AlertsPanel,
  KpiRow,
  QuickActions,
  RecentScansTable,
  TrendPanel,
} from "@/components/dashboard";
import { PageHeader } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { MOCK_ACTIVE_RECORDS, MOCK_DASHBOARD_ALERTS, MOCK_KPIS } from "@/lib/mock";
import { COMPLIANCE_STATUSES, SOURCE_TAGS } from "@/types";

/**
 * Dashboard — page 2, the first authenticated page.
 * Spec: Pages_Userflow/02-dashboard.md
 *
 * The shared shell (Sidebar, Header, role-gated navigation) is already wired
 * in `(auth)/layout.tsx` from the previous session's work — this file is only
 * the page content §2 through §6 describe.
 *
 * Every KPI, chart point, table row and alert below is read from
 * `src/lib/mock/`, matching the shape the real API is expected to return
 * (per that folder's own header comment) rather than hand-typed here.
 */

const RECENT_SCANS_LIMIT = 8;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("metadata.titleTemplate", { page: t("dashboard.meta.title") }),
  };
}

/**
 * Reads which widget, if any, should render an alternate state.
 *
 * TEMPORARY DEV SCAFFOLDING. `?demo=loading` / `?demo=empty` puts every
 * widget that supports that state into it; `?demo=<widget>-error` (e.g.
 * `recentScans-error`) puts exactly one widget into its error state so the
 * "rest of the dashboard still renders" requirement (02-dashboard.md §4) is
 * genuinely demonstrable rather than asserted. All the data here is
 * synchronous mock data with nothing that can actually fail yet, so this is
 * how the four states get exercised for the accessibility and visual QA
 * passes. Remove once `src/lib/api/analytics.ts` makes a real call that can
 * genuinely error, and drive these states from that instead.
 */
function widgetDemoState(
  demo: string | undefined,
  widget: "trend" | "recentScans" | "alerts"
): "loading" | "empty" | "error" | undefined {
  if (!demo) return undefined;
  if (demo === "loading" || demo === "empty") return demo;
  if (demo === `${widget}-error`) return "error";
  return undefined;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { locale } = await params;
  const { demo } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations();
  const tDashboard = await getTranslations("dashboard");

  const statusLabels = Object.fromEntries(
    COMPLIANCE_STATUSES.map((status) => [
      status,
      t(`vocabulary.complianceStatus.${status}`),
    ])
  ) as Record<(typeof COMPLIANCE_STATUSES)[number], string>;

  const sourceLabels = Object.fromEntries(
    SOURCE_TAGS.map((source) => [source, t(`vocabulary.sourceTag.${source}`)])
  ) as Record<(typeof SOURCE_TAGS)[number], string>;

  const recentScans = [...MOCK_ACTIVE_RECORDS]
    .sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    )
    .slice(0, RECENT_SCANS_LIMIT);

  /*
   * Resolved once per widget into a local so TypeScript can narrow the
   * conditional-spread pattern below. Calling widgetDemoState() twice (once
   * to test truthiness, again inside the spread) gave two independent calls
   * the compiler can't relate under exactOptionalPropertyTypes.
   */
  const trendDemoState = widgetDemoState(demo, "trend");
  const recentScansDemoState = widgetDemoState(demo, "recentScans");
  const alertsDemoState = widgetDemoState(demo, "alerts");

  return (
    <main id="main-content" tabIndex={-1} className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("navigation.dashboard")} />

      <section
        aria-labelledby="kpi-heading"
        className="ux4g-mb-xl"
      >
        <h2 id="kpi-heading" className="ux4g-sr-only">
          {tDashboard("kpis.heading")}
        </h2>
        <KpiRow
          kpis={MOCK_KPIS}
          labels={{
            productsScanned: tDashboard("kpis.productsScanned"),
            compliant: tDashboard("kpis.compliant"),
            nonCompliant: tDashboard("kpis.nonCompliant"),
            pending: tDashboard("kpis.pending"),
            pendingCaption: tDashboard("kpis.pendingCaption"),
          }}
          locale={locale}
          loading={demo === "loading"}
        />
      </section>

      <section aria-labelledby="trend-heading" className="ux4g-mb-xl">
        <h2 id="trend-heading" className="ux4g-sr-only">
          {tDashboard("trend.heading")}
        </h2>
        <TrendPanel
          labels={{
            heading: tDashboard("trend.heading"),
            weekly: tDashboard("trend.weekly"),
            monthly: tDashboard("trend.monthly"),
            compliantSeries: tDashboard("trend.compliantSeries"),
            nonCompliantSeries: tDashboard("trend.nonCompliantSeries"),
            totalScansSeries: tDashboard("trend.totalScansSeries"),
            notEnoughData: tDashboard("trend.notEnoughData"),
            loading: tDashboard("trend.loading"),
            errorTitle: tDashboard("trend.errorTitle"),
            errorBody: tDashboard("trend.errorBody"),
            retryLabel: t("common.actions.retry"),
          }}
          {...(trendDemoState ? { demoState: trendDemoState } : {})}
        />
      </section>

      <section aria-labelledby="recent-scans-heading" className="ux4g-mb-xl">
        <div className="lmcs-dashboard-section-head ux4g-mb-m">
          <h2 id="recent-scans-heading" className="ux4g-heading-m-strong">
            {tDashboard("recentScans.heading")}
          </h2>
          <Link
            href={ROUTES.records}
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
          >
            {tDashboard("recentScans.viewAll")}
          </Link>
        </div>
        <RecentScansTable
          records={recentScans}
          labels={{
            columnProduct: tDashboard("recentScans.columnProduct"),
            columnDate: tDashboard("recentScans.columnDate"),
            columnStatus: tDashboard("recentScans.columnStatus"),
            columnSource: tDashboard("recentScans.columnSource"),
            columnAction: t("common.actions.view"),
            caption: tDashboard("recentScans.caption"),
            emptyTitle: tDashboard("recentScans.emptyTitle"),
            emptyBody: tDashboard("recentScans.emptyBody"),
            emptyAction: tDashboard("recentScans.emptyAction"),
            errorTitle: tDashboard("recentScans.errorTitle"),
            errorBody: tDashboard("recentScans.errorBody"),
            retryLabel: t("common.actions.retry"),
            viewLabel: t("common.actions.view"),
            statusLabels,
            sourceLabels,
          }}
          locale={locale}
          {...(recentScansDemoState ? { demoState: recentScansDemoState } : {})}
        />
      </section>

      <section aria-labelledby="alerts-heading" className="ux4g-mb-xl">
        <h2 id="alerts-heading" className="ux4g-sr-only">
          {tDashboard("alerts.heading")}
        </h2>
        <AlertsPanel
          alerts={MOCK_DASHBOARD_ALERTS}
          labels={{
            heading: tDashboard("alerts.heading"),
            emptyTitle: tDashboard("alerts.emptyTitle"),
            emptyBody: tDashboard("alerts.emptyBody"),
            errorTitle: tDashboard("alerts.errorTitle"),
            errorBody: tDashboard("alerts.errorBody"),
            retryLabel: t("common.actions.retry"),
            viewAction: tDashboard("alerts.viewAction"),
          }}
          {...(alertsDemoState ? { demoState: alertsDemoState } : {})}
        />
      </section>

      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          {tDashboard("quickActions.heading")}
        </h2>
        <QuickActions
          labels={{
            scanNewProduct: tDashboard("quickActions.scanNewProduct"),
            scanEcommerceListing: tDashboard("quickActions.scanEcommerceListing"),
            viewRecords: tDashboard("quickActions.viewRecords"),
            generateReport: tDashboard("quickActions.generateReport"),
          }}
        />
      </section>
    </main>
  );
}
