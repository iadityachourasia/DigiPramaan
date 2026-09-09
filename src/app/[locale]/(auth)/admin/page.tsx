import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminConsoleView } from "@/components/admin/AdminConsoleView";
import { PageHeader } from "@/components/shared";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("title") };
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  return <main id="main-content" className="ux4g-py-l ux4g-px-l"><PageHeader title={t("title")} description={t("description")} /><AdminConsoleView /></main>;
}
