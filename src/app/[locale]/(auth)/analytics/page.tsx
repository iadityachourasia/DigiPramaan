import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { PageHeader } from "@/components/shared";

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
  const t = await getTranslations({ locale, namespace: "analytics" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("analytics");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <AnalyticsView locale={locale} />
    </main>
  );
}
