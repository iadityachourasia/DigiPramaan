import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Profile & Settings — page 10 second tab.
 * Spec: Pages_Userflow/10-reports-profile.md §4
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Profile | ${t("defaultTitle")}` };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="ux4g-py-l ux4g-px-l">
      <h1 className="ux4g-heading-xl-strong ux4g-mb-l">Profile &amp; Settings</h1>

      {/* User info — name, role, department, last login */}
      <section aria-labelledby="profile-heading" className="ux4g-mb-xl">
        <h2 id="profile-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Your account
        </h2>
      </section>

      {/* Preferences — notification settings, language */}
      <section aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Preferences
        </h2>
      </section>
    </main>
  );
}
