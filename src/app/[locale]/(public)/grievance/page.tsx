import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { GrievanceView } from "@/components/grievance/GrievanceView";

/**
 * Citizen Grievance Portal — page 11. Public, no auth, no app shell.
 * Spec: Pages_Userflow/11-citizen-grievance-portal.md
 *
 * The trust signal 11 §2 asks for is already above this page: the (public)
 * layout renders `PublicMasthead` with the emblem and department name. An
 * earlier version of this stub drew a second emblem of its own, which
 * duplicated it rather than reinforcing it.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "grievance" });
  const tMeta = await getTranslations({ locale, namespace: "metadata" });
  return { title: `${t("meta.title")} | ${tMeta("defaultTitle")}`, description: t("description") };
}

export default async function GrievancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("grievance");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <h1 className="ux4g-heading-xl-strong">{t("heading")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("intro")}
        </p>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">
          {t("noAccountNote")}
        </p>
      </header>

      <GrievanceView locale={locale} />
    </main>
  );
}
