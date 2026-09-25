import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { NotificationsView } from "@/components/notifications/NotificationsView";
import { PageHeader } from "@/components/shared";

/**
 * Notifications & Alerts — a per-officer inbox, distinct from the Global
 * Activity Log (that's a system-wide audit trail, Admin/Reviewer only;
 * this is a personal feed every authenticated role has their own of).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "notifications" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("notifications");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <NotificationsView locale={locale} />
    </main>
  );
}
