import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ReportVerificationView } from "@/components/reports/ReportVerificationView";

/**
 * Report verification — Phase 13's public authenticity check. Reached
 * exclusively by scanning a compliance report's own QR code (or typing
 * the URL it encodes); nobody signs in and no report content is ever
 * shown here — see ReportVerificationView's own docstring on why it
 * cannot expose more than the 5-field backend response.
 *
 * `(public)` route group: the layout already supplies PublicMasthead +
 * Footer, same statutory trust-signal precedent as Login/the Citizen
 * Grievance Portal, no separate emblem of its own (avoiding the exact
 * duplication `grievance/page.tsx`'s own docstring calls out).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reportVerification" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}`, description: t("description") };
}

export default async function ReportVerificationPage({
  params,
}: {
  params: Promise<{ locale: string; reportId: string }>;
}) {
  const { locale, reportId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reportVerification");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">{t("intro")}</p>
      </header>

      <ReportVerificationView reportId={reportId} locale={locale} />
    </main>
  );
}
