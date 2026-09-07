import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { SITE_LAST_UPDATED } from "@/lib/constants";

/**
 * Accessibility Statement — one of five statutory footer pages required by
 * BRD §9.4 / GIGW 3.0 (`Footer.tsx` has linked here since that page was
 * built; the destination did not exist until now).
 *
 * No spec file covers this page's content — BRD §9.4 only requires that it
 * exist. The conformance target (WCAG 2.1 AA) is BRD §3's own stated
 * requirement, so this states it rather than a stronger claim this build
 * has not been independently audited against. The one concrete, honest
 * limitation named below (untagged PDFs) is a real, documented gap
 * elsewhere in this codebase (`ReportAccessibility.pdfIsTagged`), not
 * generic boilerplate.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staticPages.accessibilityStatement" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function AccessibilityStatementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staticPages.accessibilityStatement");
  const format = await getFormatter();

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("description")}
        </p>
      </header>

      <div className="lmcs-page-section lmcs-measure">
        <section aria-labelledby="conformance-heading">
          <h2 id="conformance-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("conformanceHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("conformanceBody")}</p>
        </section>

        <section aria-labelledby="measures-heading">
          <h2 id="measures-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("measuresHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("measuresBody")}</p>
        </section>

        <section aria-labelledby="limitations-heading">
          <h2 id="limitations-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("limitationsHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("limitationsBody")}</p>
        </section>

        <section aria-labelledby="feedback-heading">
          <h2 id="feedback-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("feedbackHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("feedbackBody")}</p>
        </section>

        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("reviewedLabel")}{" "}
          {format.dateTime(new Date(SITE_LAST_UPDATED), {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </main>
  );
}
