import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ScanStatusView } from "@/components/scan/ScanStatusView";
import { PageHeader } from "@/components/shared";

/**
 * Processing Pipeline Tracker — page 3, Step 5 (03-scan-upload.md §2).
 * On submit, the wizard already created this scan's pipeline run
 * server-side (see src/lib/server/scan-pipeline-store.ts) — this route just
 * shows and polls it.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Processing | ${t("defaultTitle")}` };
}

export default async function ScanStatusPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("scan.pipeline");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ScanStatusView scanId={id} />
    </main>
  );
}
