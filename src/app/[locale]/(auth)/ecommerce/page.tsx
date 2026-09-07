import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { EcommerceView } from "@/components/ecommerce/EcommerceView";
import { PageHeader } from "@/components/shared";

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
  const t = await getTranslations({ locale, namespace: "ecommerce" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function EcommercePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ecommerce");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <EcommerceView />
    </main>
  );
}
