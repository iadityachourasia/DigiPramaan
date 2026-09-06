import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { RecordDetailView } from "@/components/records/RecordDetailView";

/**
 * Product Compliance Detail — page 6.
 * Spec: Pages_Userflow/06-product-compliance-detail.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "recordDetail" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <RecordDetailView recordId={id} locale={locale} />
    </main>
  );
}
