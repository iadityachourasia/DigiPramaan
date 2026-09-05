import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Declaration Extraction & Verification — page 4.
 * THE CORE PS PAGE. Protect its build and review time above all others.
 * Spec: Pages_Userflow/04-extraction-verification.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Extraction & Verification | ${t("defaultTitle")}` };
}

export default async function ExtractionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <h1 className="ux4g-heading-xl-strong ux4g-mb-l">
        Declaration Extraction &amp; Verification
      </h1>
      <p className="ux4g-body-s-default ux4g-text-neutral-secondary ux4g-mb-l">
        Record: {id}
      </p>

      <div className="lmcs-extraction-layout">
        {/* Left panel — scanned image with annotations (04 §2) */}
        <section aria-labelledby="image-heading">
          <h2 id="image-heading" className="ux4g-heading-m-strong ux4g-mb-m">
            Scanned label
          </h2>
        </section>

        {/* Right panel — extracted declarations + checklist (04 §3) */}
        <section aria-labelledby="declarations-heading">
          <h2 id="declarations-heading" className="ux4g-heading-m-strong ux4g-mb-m">
            Extracted declarations
          </h2>
          {/* Per-field rows with confidence, value, pass/fail */}
        </section>
      </div>

      {/* Confirm & Verify action — 04 §4 */}
    </main>
  );
}
