import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Right to Information — one of five statutory footer pages required by
 * BRD §9.4 / GIGW 3.0 (RTI Act, 2005). No spec file covers its content;
 * the CPIO and Appellate Authority below are named by designation only,
 * following the RTI Act's own convention and this codebase's practice of
 * never inventing a real person's name (see `CITIZEN_ACTOR_ID`'s own
 * reasoning in `src/types/grievance.ts` for the same discipline applied
 * elsewhere). rtionline.gov.in is the Government of India's real RTI
 * filing portal, referenced as plain text rather than a clickable link.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staticPages.rti" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function RtiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staticPages.rti");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("description")}
        </p>
      </header>

      <div className="lmcs-page-section lmcs-measure">
        <section aria-labelledby="about-act-heading">
          <h2 id="about-act-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("aboutHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("aboutBody")}</p>
        </section>

        <section aria-labelledby="how-to-file-heading">
          <h2 id="how-to-file-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("howToFileHeading")}
          </h2>
          <p className="ux4g-body-m-default ux4g-mb-s">{t("howToFileBody")}</p>
          <p className="ux4g-body-m-default">{t("onlinePortalBody")}</p>
        </section>

        <section aria-labelledby="cpio-heading">
          <h2 id="cpio-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("cpioHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("cpioBody")}</p>
        </section>

        <section aria-labelledby="appellate-heading">
          <h2 id="appellate-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("appellateHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("appellateBody")}</p>
        </section>
      </div>
    </main>
  );
}
