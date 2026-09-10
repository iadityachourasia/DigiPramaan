import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CaseDetailView } from "@/components/cases/CaseDetailView";

/**
 * Case Detail — Compliance Follow-Through, Phase 4 USP. Net-new page, same
 * conventions as products/[id]/page.tsx.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "caseDetail" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("metaTitle")} | ${tMeta("defaultTitle")}` };
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <CaseDetailView caseId={id} />
    </main>
  );
}
