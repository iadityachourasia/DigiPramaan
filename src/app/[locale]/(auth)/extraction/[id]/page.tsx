import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ExtractionView } from "@/components/scan/ExtractionView";
import { PageHeader } from "@/components/shared";

/**
 * Declaration Extraction & Verification — page 4.
 * THE CORE PS PAGE. Protect its build and review time above all others.
 * Spec: Pages_Userflow/04-extraction-verification.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "extraction" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function ExtractionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("extraction");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ExtractionView recordId={id} />
    </main>
  );
}
