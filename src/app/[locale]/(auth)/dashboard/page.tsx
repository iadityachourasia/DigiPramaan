import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Dashboard — page 2. First authenticated page; the shell is built here.
 * Spec: Pages_Userflow/02-dashboard.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Dashboard | ${t("defaultTitle")}` };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <h1 className="ux4g-heading-xl-strong ux4g-mb-l">
        {t("navigation.dashboard")}
      </h1>

      {/* KPI cards row — 02-dashboard.md §2 */}
      <section aria-labelledby="kpi-heading" className="ux4g-mb-xl">
        <h2 id="kpi-heading" className="ux4g-sr-only">Key metrics</h2>
        {/* Four KPI cards: Products Scanned, Compliant, Non-Compliant, Pending */}
      </section>

      {/* Compliance trend chart — 02-dashboard.md §3 */}
      <section aria-labelledby="trend-heading" className="ux4g-mb-xl">
        <h2 id="trend-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Compliance trend
        </h2>
      </section>

      {/* Recent activity / alerts — 02-dashboard.md §5 */}
      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Alerts
        </h2>
      </section>
    </main>
  );
}
