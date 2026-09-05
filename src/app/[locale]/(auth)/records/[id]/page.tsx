import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Product Compliance Detail — page 6.
 * Spec: Pages_Userflow/06-product-compliance-detail.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Product Detail | ${t("defaultTitle")}` };
}

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <p className="ux4g-body-s-default ux4g-text-neutral-secondary ux4g-mb-s">
        Record: {id}
      </p>

      {/* Product header — name, status, source, dates */}
      <section aria-labelledby="product-heading" className="ux4g-mb-xl">
        <h1 id="product-heading" className="ux4g-heading-xl-strong">
          Product Compliance Detail
        </h1>
      </section>

      {/* Declaration checklist — 06 §2 */}
      <section aria-labelledby="checklist-heading" className="ux4g-mb-xl">
        <h2 id="checklist-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Declaration checklist
        </h2>
      </section>

      {/* Violation summary — 06 §3 */}
      <section aria-labelledby="violations-heading" className="ux4g-mb-xl">
        <h2 id="violations-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Violation summary
        </h2>
      </section>

      {/* Audit trail — 06 §4 */}
      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Audit trail
        </h2>
      </section>
    </main>
  );
}
