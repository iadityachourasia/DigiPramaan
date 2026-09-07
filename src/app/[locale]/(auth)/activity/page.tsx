import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ActivityView } from "@/components/activity/ActivityView";
import { PageHeader } from "@/components/shared";

/**
 * Global Activity Log — 13-history-and-hierarchy.md §3.2.
 *
 * Unnumbered in the spec's page list, like the Admin Console. Admin and
 * Reviewer only: it is a log of what officers did, so an Enforcement Officer
 * not seeing it is the point rather than an oversight. Gated by the
 * `activity.view` nav permission and by the client guard inside the view.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "activity" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("activity");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ActivityView locale={locale} />
    </main>
  );
}
