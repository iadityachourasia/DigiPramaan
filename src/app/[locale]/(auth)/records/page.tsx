import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { RecordsView } from "@/components/records/RecordsView";
import { PageHeader } from "@/components/shared";

/**
 * Compliance Records — page 5. Filterable, sortable list of all records.
 * Spec: Pages_Userflow/05-compliance-records.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "records" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function RecordsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("records");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <RecordsView locale={locale} />
    </main>
  );
}
