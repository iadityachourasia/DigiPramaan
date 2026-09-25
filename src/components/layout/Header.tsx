"use client";

import { useTranslations } from "next-intl";

import { DigiPramaanLogo } from "@/components/shared";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

import { NotificationsBell } from "./NotificationsBell";
import { OfficerProfileButton } from "./OfficerProfileButton";

/**
 * Header — the top bar for authenticated pages.
 *
 * Carries what `02-dashboard.md` §2 requires of the shell: the app identity,
 * a real notifications bell (`NotificationsBell` — backend/app/api/v1/
 * notifications.py; previously a disabled placeholder that showed a
 * fabricated count from mock fixtures with no onClick at all), and the
 * signed-in officer's account control (name, role, and — via
 * `OfficerProfileButton` — View Profile/Logout).
 *
 * The role badge (inside `OfficerProfileButton`) pairs a status token with an
 * icon and a visible text label, so it never signals by colour alone
 * (A-10 / A-14). Its wording comes from the `vocabulary.role` catalogue
 * rather than printing `user.role` directly, which would bypass i18n and, in
 * Hindi, print an English string.
 */

export interface HeaderProps {
  /** Toggle the mobile sidebar drawer. */
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const t = useTranslations();

  return (
    <header className="lmcs-header" role="banner">
      {/* In-page fragment, so a raw anchor is correct — no locale to carry. */}
      <a href="#main-content" className="lmcs-skip-link ux4g-btn ux4g-btn-primary">
        {t("accessibility.skipToMain")}
      </a>

      <div className="lmcs-header-left">
        <button
          type="button"
          className="lmcs-header-menu-btn ux4g-btn ux4g-btn-text-neutral"
          onClick={onMenuToggle}
          aria-label={t("accessibility.openMenu")}
        >
          <span className="ux4g-icon-outlined" aria-hidden="true">
            menu
          </span>
        </button>

        <div className="lmcs-header-brand">
          <DigiPramaanLogo size="sm" className="lmcs-brand-mark-compact" />
          <div className="lmcs-header-titles">
            <span className="ux4g-title-s-strong">{t("app.name")}</span>
            <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {t("app.government")}
            </span>
          </div>
        </div>
      </div>

      <div className="lmcs-header-right">
        <ThemeToggle />
        <NotificationsBell />

        <OfficerProfileButton />
      </div>
    </header>
  );
}
