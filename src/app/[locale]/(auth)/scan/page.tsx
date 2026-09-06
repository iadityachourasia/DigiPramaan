import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ScanWizard } from "@/components/scan/ScanWizard";
import { PageHeader } from "@/components/shared";

/**
 * Scan / Upload Product — page 3.
 * Spec: Pages_Userflow/03-scan-upload.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const tScan = await getTranslations({ locale, namespace: "scan" });
  return { title: t("titleTemplate", { page: tScan("meta.title") }) };
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("scan");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ScanWizard />
    </main>
  );
}
