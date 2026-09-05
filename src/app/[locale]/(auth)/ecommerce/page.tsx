import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * E-commerce Listing Scanner — page 8. USP page.
 * Spec: Pages_Userflow/08-ecommerce-listing-scanner.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `E-commerce Scanner | ${t("defaultTitle")}` };
}

export default async function EcommercePage({
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
        {t("navigation.ecommerceScanner")}
      </h1>

      {/* URL input — 08 §2 */}
      <section aria-labelledby="input-heading" className="ux4g-mb-xl">
        <h2 id="input-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Scan a product listing
        </h2>
      </section>

      {/* Batch history — 08 §3 */}
      <section aria-labelledby="batch-heading">
        <h2 id="batch-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Previous scans
        </h2>
      </section>
    </main>
  );
}
