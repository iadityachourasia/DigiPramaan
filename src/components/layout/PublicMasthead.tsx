"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { ACTIVE_LOCALES, LOCALE_LABELS } from "@/i18n/routing";
import { DigiPramaanLogo } from "@/components/shared";
import { DisplaySizeControl } from "@/components/shared/DisplaySizeControl";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { ROUTES } from "@/lib/constants";
import { PublicNavbar } from "./PublicNavbar";

/** Shared government utility strip; the landing route adds full navigation. */
export function PublicMasthead() {
  const t = useTranslations();
  const isLanding = usePathname() === "/";

  return (
    <div className="lmcs-masthead">
      <div className="lmcs-masthead-utility">
        <div className="ux4g-container lmcs-masthead-utility-inner">
          <div className="lmcs-government-identity">
            <span className="ux4g-label-s-default lmcs-government-names">
              <span lang="hi">{t("app.governmentHindi")}</span>
              <span>{t("app.government")}</span>
            </span>
            <span className="lmcs-department-mark">
              <Image
                src="/images/national-emblem.svg"
                alt=""
                width={20}
                height={32}
                className="lmcs-government-emblem"
                priority
              />
              <span className="lmcs-department-wordmark">
                <Image
                  src="/images/consumer-affairs-lockup.png"
                  alt={t("app.department")}
                  width={127}
                  height={42}
                  priority
                />
              </span>
            </span>
            <span className="ux4g-label-s-default lmcs-ministry-label">
              {t("app.ministry")}
            </span>
          </div>

          <div className="lmcs-masthead-actions">
            {isLanding ? (
              <a
                href="#main-content"
                className="ux4g-label-s-default lmcs-masthead-link lmcs-utility-skip"
              >
                {t("accessibility.skipToMain")}
              </a>
            ) : null}
            <Link
              href={ROUTES.accessibilityStatement}
              className="ux4g-label-s-default lmcs-masthead-link"
            >
              {t("accessibility.screenReaderAccess")}
            </Link>
            <DisplaySizeControl />
            <span className="ux4g-label-s-default lmcs-utility-language">
              <span className="ux4g-icon-outlined" aria-hidden="true">
                language
              </span>
              {ACTIVE_LOCALES.map((locale) => LOCALE_LABELS[locale]).join(" · ")}
            </span>
            {isLanding ? null : <ThemeToggle />}
          </div>
        </div>
      </div>

      {isLanding ? (
        <PublicNavbar />
      ) : (
        <div className="ux4g-container lmcs-masthead-identity-inner">
          <Link href="/" className="lmcs-masthead-brand">
            <DigiPramaanLogo size="md" className="lmcs-brand-mark-compact" />
            <span className="lmcs-masthead-titles">
              <span className="ux4g-title-s-strong">{t("app.name")}</span>
              <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                {t("app.descriptor")}
              </span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
