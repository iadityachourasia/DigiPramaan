import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ProfileView } from "@/components/profile/ProfileView";
import { PageHeader } from "@/components/shared";

/**
 * Profile & Settings — page 10's second surface.
 *
 * Its own route rather than a tab on Reports: 10 §5 says Profile/Settings may
 * be "visually lower-priority in layout than the Report Builder", and a
 * separate route is the strongest form of that. Reached from the Reports page
 * and the app-shell user area — there is deliberately no second sidebar item,
 * which would contradict the existing combined "Reports & Profile" label.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}` };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <PageHeader title={t("heading")} description={t("description")} />
      <ProfileView />
    </main>
  );
}
