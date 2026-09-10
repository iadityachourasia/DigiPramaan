import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ProductDnaView } from "@/components/products/ProductDnaView";

/**
 * Product Compliance DNA — Phase 4 USP. Net-new page (no Pages_Userflow
 * spec, no mock equivalent) — reads the real FastAPI backend directly.
 * Same thin-Server-Component-page + Client-Component-view structure as
 * every other detail page (see manufacturers/[id]/page.tsx).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "productDna" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("metaTitle")} | ${tMeta("defaultTitle")}` };
}

export default async function ProductDnaPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <ProductDnaView productId={id} />
    </main>
  );
}
