import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Scan / Upload Product — page 3.
 * Spec: Pages_Userflow/03-scan-upload.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Scan / Upload | ${t("defaultTitle")}` };
}

export default async function ScanPage({
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
        {t("navigation.scanUpload")}
      </h1>

      {/* Image upload zone — 03-scan-upload.md §2 */}
      <section aria-labelledby="upload-heading" className="ux4g-mb-xl">
        <h2 id="upload-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Upload product images
        </h2>
      </section>

      {/* Metadata form — category, manufacturer, region */}
      <section aria-labelledby="metadata-heading" className="ux4g-mb-xl">
        <h2 id="metadata-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Product details
        </h2>
      </section>
    </main>
  );
}
