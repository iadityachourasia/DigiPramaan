import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ScorecardView } from "@/components/manufacturers/ScorecardView";

/**
 * Individual Manufacturer Scorecard detail — sub-page of page 9.
 * Spec: Pages_Userflow/09-manufacturer-scorecard.md §3
 *
 * The heading is rendered by `ScorecardView` rather than a `PageHeader`
 * here: the manufacturer's name is the page title, and it isn't known until
 * the scorecard resolves.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "manufacturers" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("detail.metaTitle")} | ${tMeta("defaultTitle")}` };
}

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <ScorecardView id={id} locale={locale} />
    </main>
  );
}
