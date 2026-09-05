import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Citizen Grievance Portal — page 11. Public, no auth, no shell.
 * Spec: Pages_Userflow/11-citizen-grievance-portal.md
 * USP page — the only public-facing surface in the product.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: `Report a Product | ${t("defaultTitle")}`,
    description: t("description"),
  };
}

export default async function GrievancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <img
          src="/images/emblem.svg"
          alt={t("app.emblemAlt")}
          className="lmcs-grievance-emblem"
          width={48}
          height={56}
        />
        <h1 className="ux4g-heading-xl-strong">
          Report a Packaging Concern
        </h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          Report a product whose label may not comply with the Legal Metrology
          (Packaged Commodities) Rules, 2011. No account is needed.
        </p>
      </header>

      <section aria-labelledby="grievance-form-heading">
        <h2 id="grievance-form-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Submit a report
        </h2>
        {/* Grievance form: photo upload, concern checkboxes, optional */}
        {/* contact details. Spec: 11-citizen-grievance-portal.md §2. */}
      </section>

      <section className="ux4g-mt-xl" aria-labelledby="grievance-track-heading">
        <h2 id="grievance-track-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Track your report
        </h2>
        {/* Reference number lookup. Spec: 11-citizen-grievance-portal.md §3. */}
      </section>
    </main>
  );
}
