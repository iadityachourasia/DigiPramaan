import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Reports — page 10. Generate compliance reports in PDF/editable format.
 * Spec: Pages_Userflow/10-reports-profile.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Reports | ${t("defaultTitle")}` };
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <h1 className="ux4g-heading-xl-strong ux4g-mb-l">
        Reports
      </h1>

      {/* Report generator — scope, format, date range */}
      <section aria-labelledby="generate-heading" className="ux4g-mb-xl">
        <h2 id="generate-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          {t("common.actions.generateReport")}
        </h2>
      </section>

      {/* Previously generated reports — 10 §3 */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Report history
        </h2>
      </section>
    </main>
  );
}
