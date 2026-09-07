import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Terms of Use — one of five statutory footer pages required by BRD §9.4 /
 * GIGW 3.0. No spec file covers its content; the clauses below follow the
 * standard terms of use published across Government of India websites
 * (acceptance, permitted use, hyperlinking policy, content ownership,
 * disclaimer, governing law).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staticPages.termsOfUse" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function TermsOfUsePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staticPages.termsOfUse");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("description")}
        </p>
      </header>

      <div className="lmcs-page-section lmcs-measure">
        <section aria-labelledby="acceptance-heading">
          <h2 id="acceptance-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("acceptanceHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("acceptanceBody")}</p>
        </section>

        <section aria-labelledby="permitted-use-heading">
          <h2 id="permitted-use-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("permittedUseHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("permittedUseBody")}</p>
        </section>

        <section aria-labelledby="hyperlinking-heading">
          <h2 id="hyperlinking-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("hyperlinkingHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("hyperlinkingBody")}</p>
        </section>

        <section aria-labelledby="content-ownership-heading">
          <h2 id="content-ownership-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("contentOwnershipHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("contentOwnershipBody")}</p>
        </section>

        <section aria-labelledby="disclaimer-heading">
          <h2 id="disclaimer-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("disclaimerHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("disclaimerBody")}</p>
        </section>

        <section aria-labelledby="jurisdiction-heading">
          <h2 id="jurisdiction-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("jurisdictionHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("jurisdictionBody")}</p>
        </section>
      </div>
    </main>
  );
}
