import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";
import { Alert } from "@/components/ui/Alert";
import { LoadingSpinner } from "@/components/shared";

/**
 * Login — page 1 in the build order.
 * Spec: Pages_Userflow/01-login.md
 *
 * Standalone: no sidebar, no authenticated header. The government masthead in
 * `(public)/layout.tsx` is identity rather than navigation, and BRD §9.4
 * requires it on every page; the landing page's navbar deliberately does not
 * appear here.
 *
 * A Server Component holding metadata and the branding block. The form is a
 * client island, which is the same split the rest of the app uses.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  /* Uses the shared title template, which was previously defined but unused. */
  return {
    title: t("metadata.titleTemplate", { page: t("login.title") }),
    description: t("login.subtitle"),
  };
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
    <main id="main-content" tabIndex={-1} className="lmcs-login-page">
      <div className="lmcs-login-card">
        <div className="lmcs-login-header">
          <Image
            src="/images/emblem.svg"
            alt={t("app.emblemAlt")}
            className="lmcs-login-emblem"
            width={64}
            height={64}
            unoptimized
          />

          <h1 className="ux4g-heading-l-strong">{t("app.name")}</h1>
          <p className="ux4g-title-s-default ux4g-text-neutral-secondary">
            {t("app.descriptor")}
          </p>
          <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
            {t("login.subtitle")}
          </p>
        </div>

        {/*
          `useSearchParams` inside the form needs a Suspense boundary; without
          one it opts the whole route out of static rendering.
        */}
        <Suspense
          fallback={
            <LoadingSpinner label={t("common.loading")} variant="inline" />
          }
        >
          <LoginForm />
        </Suspense>

        {/*
          Demonstration credentials.
          This build has no directory behind it, and a reviewer who cannot get
          past the first screen sees nothing else. Remove this block the moment
          real authentication lands — BRD §15 Q-06.
        */}
        {/*
          No `title` prop. The package lays an Alert's content out as a row, so
          a title beside a long message squeezes both into narrow columns inside
          a 420px card. One flowing message reads better at this width.
        */}
        <Alert severity="info">{t("login.demoBody")}</Alert>

        <div className="lmcs-login-footer">
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("app.department")} · {t("app.government")}
          </p>
        </div>
      </div>
    </main>
  );
}
