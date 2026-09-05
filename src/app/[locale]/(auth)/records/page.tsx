import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Compliance Records — page 5. Filterable, sortable list of all records.
 * Spec: Pages_Userflow/05-compliance-records.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Compliance Records | ${t("defaultTitle")}` };
}

export default async function RecordsPage({
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
        {t("navigation.complianceRecords")}
      </h1>

      {/* Filter bar — status, category, date range, source, region */}
      <section aria-labelledby="filters-heading" className="ux4g-mb-l">
        <h2 id="filters-heading" className="ux4g-sr-only">Filters</h2>
      </section>

      {/* Records table with pagination — 05-compliance-records.md §2 */}
      <section aria-labelledby="table-heading">
        <h2 id="table-heading" className="ux4g-sr-only">Records</h2>
      </section>
    </main>
  );
}
