import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * Help — one of five statutory footer pages required by BRD §9.4 / GIGW
 * 3.0. No spec file covers its content; organised by who is reading it
 * (Officer/Admin, Reviewer, member of the public) since those are the
 * only three audiences this system has, per the Role Permission Matrix
 * plus the public grievance path.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staticPages.help" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staticPages.help");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("description")}
        </p>
      </header>

      <div className="lmcs-page-section lmcs-measure">
        <section aria-labelledby="officers-heading">
          <h2 id="officers-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("officersHeading")}
          </h2>
          <p className="ux4g-body-m-default ux4g-mb-s">{t("officersBody")}</p>
          <Link href={ROUTES.login} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
            {t("signInCta")}
          </Link>
        </section>

        <section aria-labelledby="reviewers-heading">
          <h2 id="reviewers-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("reviewersHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("reviewersBody")}</p>
        </section>

        <section aria-labelledby="citizens-heading">
          <h2 id="citizens-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("citizensHeading")}
          </h2>
          <p className="ux4g-body-m-default ux4g-mb-s">{t("citizensBody")}</p>
          <Link href={ROUTES.grievance} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
            {t("reportCta")}
          </Link>
        </section>

        <section aria-labelledby="support-heading">
          <h2 id="support-heading" className="ux4g-heading-m-strong ux4g-mb-s">
            {t("supportHeading")}
          </h2>
          <p className="ux4g-body-m-default">{t("supportBody")}</p>
        </section>
      </div>
    </main>
  );
}
