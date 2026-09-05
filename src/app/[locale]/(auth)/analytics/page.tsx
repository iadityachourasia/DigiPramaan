import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Analytics & Violation Trends — page 7.
 * Spec: Pages_Userflow/07-analytics-violation-trends.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Analytics | ${t("defaultTitle")}` };
}

export default async function AnalyticsPage({
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
        {t("navigation.analytics")}
      </h1>

      {/* Date range selector + filter controls */}
      <section aria-labelledby="filters-heading" className="ux4g-mb-l">
        <h2 id="filters-heading" className="ux4g-sr-only">Filters</h2>
      </section>

      {/* Violation category breakdown chart — 07 §2 */}
      <section aria-labelledby="category-heading" className="ux4g-mb-xl">
        <h2 id="category-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Violation categories
        </h2>
      </section>

      {/* Trend over time chart — 07 §3 */}
      <section aria-labelledby="trend-heading" className="ux4g-mb-xl">
        <h2 id="trend-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Trend over time
        </h2>
      </section>

      {/* Top offenders table — 07 §4 */}
      <section aria-labelledby="offenders-heading">
        <h2 id="offenders-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Top offenders
        </h2>
      </section>
    </main>
  );
}
