import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Manufacturer Compliance Scorecards — page 9. USP page.
 * Spec: Pages_Userflow/09-manufacturer-scorecard.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Manufacturer Scorecards | ${t("defaultTitle")}` };
}

export default async function ManufacturersPage({
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
        {t("navigation.manufacturerScorecard")}
      </h1>

      {/* Search + filter bar */}
      <section aria-labelledby="filters-heading" className="ux4g-mb-l">
        <h2 id="filters-heading" className="ux4g-sr-only">Filters</h2>
      </section>

      {/* Scorecard grid — 09 §2 */}
      <section aria-labelledby="grid-heading">
        <h2 id="grid-heading" className="ux4g-sr-only">Manufacturer scorecards</h2>
      </section>
    </main>
  );
}
