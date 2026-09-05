import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Login — page 1 in build order. Standalone, no shell.
 * Spec: Pages_Userflow/01-login.md
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Sign in | ${t("defaultTitle")}` };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main id="main-content" className="lmcs-login-page">
      <div className="lmcs-login-card ux4g-container">
        <div className="lmcs-login-header">
          <Image
            src="/images/emblem.svg"
            alt={t("app.emblemAlt")}
            className="lmcs-login-emblem"
            width={64}
            height={64}
            unoptimized
          />
          <h1 className="ux4g-heading-l-strong">{t("login.title")}</h1>
          <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
            {t("login.subtitle")}
          </p>
        </div>

        {/* Login form will be implemented in Phase 2 using TextField, */}
        {/* Checkbox, and the login validation schema. */}
        <div className="lmcs-login-form-area">
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("login.roleCaption")}
          </p>
        </div>

        <div className="lmcs-login-footer">
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("app.department")} · {t("app.government")}
          </p>
        </div>
      </div>
    </main>
  );
}
