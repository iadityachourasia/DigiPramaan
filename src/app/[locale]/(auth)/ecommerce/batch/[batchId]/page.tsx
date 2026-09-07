import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { BatchView } from "@/components/ecommerce/BatchView";
import { PageHeader } from "@/components/shared";

/**
 * One bulk batch's queue — page 8, bulk mode (08 §4).
 * Its own route because step 5 requires an officer be able to navigate
 * away mid-batch and return to accurate progress.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ecommerce" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("batch.metaTitle")} | ${tMeta("defaultTitle")}` };
}

export default async function EcommerceBatchPage({
  params,
}: {
  params: Promise<{ locale: string; batchId: string }>;
}) {
  const { locale, batchId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ecommerce");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("batch.heading")} description={t("batch.description")} />
      <BatchView batchId={batchId} />
    </main>
  );
}
