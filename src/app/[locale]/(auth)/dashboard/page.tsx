import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { PageHeader } from "@/components/shared";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

/** Thin server shell; DashboardView owns viewer-aware data fetching. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("navigation");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("dashboard")} />
      <DashboardView locale={locale} />
    </main>
  );
}
