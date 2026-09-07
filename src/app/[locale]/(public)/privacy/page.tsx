import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Privacy Policy — one of five statutory footer pages required by BRD §9.4
 * / GIGW 3.0 (IT Act, 2000). No spec file covers its content; the data
 * practices described below are the system's actual, verified design —
 * the separation of a citizen's optional contact details from the public
 * compliance record is `CitizenReportDetails.hasContactDetails`'s own
 * documented reason for existing (`src/types/grievance.ts`), not invented
 * for this page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staticPages.privacyPolicy" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staticPages.privacyPolicy");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("description")}
        </p>
      </header>

      <div className="lmcs-page-section lmcs-measure">
        <section aria-labelledby="collection-heading">
          <h2 id="collection-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("collectionHeading")}
          </h2>
          <p className="ux4g-body-m-default ux4g-mb-s">{t("collectionBodyOfficers")}</p>
          <p className="ux4g-body-m-default">{t("collectionBodyCitizens")}</p>
        </section>

        <section aria-labelledby="use-heading">
          <h2 id="use-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("useHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("useBody")}</p>
        </section>

        <section aria-labelledby="protection-heading">
          <h2 id="protection-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("protectionHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("protectionBody")}</p>
        </section>

        <section aria-labelledby="sharing-heading">
          <h2 id="sharing-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("sharingHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("sharingBody")}</p>
        </section>

        <section aria-labelledby="privacy-contact-heading">
          <h2 id="privacy-contact-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("contactHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("contactBody")}</p>
        </section>
      </div>
    </main>
  );
}
