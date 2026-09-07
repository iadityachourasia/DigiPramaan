import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ManufacturersView } from "@/components/manufacturers/ManufacturersView";
import { PageHeader } from "@/components/shared";

/**
 * Manufacturer Compliance Scorecards — page 9. USP page.
 * Spec: Pages_Userflow/09-manufacturer-scorecard.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "manufacturers" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function ManufacturersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("manufacturers");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ManufacturersView locale={locale} />
    </main>
  );
}
