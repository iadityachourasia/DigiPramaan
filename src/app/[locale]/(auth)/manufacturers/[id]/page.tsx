import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Individual Manufacturer Scorecard detail — sub-page of page 9.
 * Spec: Pages_Userflow/09-manufacturer-scorecard.md §3
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Manufacturer Detail | ${t("defaultTitle")}` };
}

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <p className="ux4g-body-s-default ux4g-text-neutral-secondary ux4g-mb-s">
        Manufacturer: {id}
      </p>

      {/* Manufacturer header — name, location, flag status */}
      <section aria-labelledby="manufacturer-heading" className="ux4g-mb-xl">
        <h1 id="manufacturer-heading" className="ux4g-heading-xl-strong">
          Manufacturer Scorecard
        </h1>
      </section>

      {/* Compliance trend chart — 09 §3 */}
      <section aria-labelledby="trend-heading" className="ux4g-mb-xl">
        <h2 id="trend-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Compliance trend
        </h2>
      </section>

      {/* Products list — 09 §4 */}
      <section aria-labelledby="products-heading">
        <h2 id="products-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Products
        </h2>
      </section>
    </main>
  );
}
