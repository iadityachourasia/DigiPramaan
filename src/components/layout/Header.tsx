"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { useAuth } from "@/lib/hooks";

/**
 * Header — the top bar for authenticated pages.
 *
 * Contains:
 *   - mobile menu toggle (sends `onMenuToggle` to the parent)
 *   - State Emblem + app name (GIGW mandatory)
 *   - notifications bell
 *   - user avatar / role badge
 *   - logout action
 *
 * The skip link targets #main-content, which every page sets on its <main>.
 */

export interface HeaderProps {
  /** Toggle the mobile sidebar drawer. */
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const t = useTranslations();
  const { user, signOut } = useAuth();

  return (
    <header className="lmcs-header" role="banner">
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
          <Image
            src="/images/emblem.svg"
            alt={t("app.emblemAlt")}
            className="lmcs-header-emblem"
            width={40}
            height={40}
            unoptimized
          />
          <div className="lmcs-header-titles">
            <span className="ux4g-title-s-strong">{t("app.name")}</span>
            <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {t("app.government")}
            </span>
          </div>
        </div>
      </div>

      <div className="lmcs-header-right">
        <button
          type="button"
          className="ux4g-btn ux4g-btn-text-neutral lmcs-header-action"
          aria-label={t("navigation.notifications")}
        >
          <span className="ux4g-icon-outlined" aria-hidden="true">
            notifications
          </span>
        </button>

        {user ? (
          <div className="lmcs-header-user">
            <span className="ux4g-label-m-default">{user.fullName}</span>
            <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {user.role}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          className="ux4g-btn ux4g-btn-text-neutral lmcs-header-action"
          onClick={signOut}
          aria-label={t("navigation.logout")}
        >
          <span className="ux4g-icon-outlined" aria-hidden="true">
            logout
          </span>
        </button>
      </div>
    </header>
  );
}
