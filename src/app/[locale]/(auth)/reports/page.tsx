import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ReportsView } from "@/components/reports/ReportsView";
import { PageHeader } from "@/components/shared";

/**
 * Reports — page 10. Compliance reports in PDF and editable formats.
 * Spec: Pages_Userflow/10-reports-profile.md, plus 13 §2's preview/export additions.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reports" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reports");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ReportsView locale={locale} />
    </main>
  );
}
