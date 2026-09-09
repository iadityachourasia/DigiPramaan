"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { MOCK_DASHBOARD_ALERTS } from "@/lib/mock";
import { useAuth } from "@/lib/hooks";

/**
 * Header — the top bar for authenticated pages.
 *
 * Carries what `02-dashboard.md` §2 requires of the shell: the app identity,
 * the signed-in user with their role as a badge, notifications with
 * an unread count, and the sign-out action.
 *
 * The role badge pairs a status token with an icon and a visible text label, so
 * it never signals by colour alone (A-10 / A-14). Its wording comes from the
 * `vocabulary.role` catalogue rather than printing `user.role` directly, which
 * would bypass i18n and, in Hindi, print an English string.
 */

export interface HeaderProps {
  /** Toggle the mobile sidebar drawer. */
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const t = useTranslations();
  const { user, signOut } = useAuth();

  /*
   * TODO: sourced from the dashboard alert fixtures until a notifications
   * endpoint exists. Deliberately real mock data rather than a hardcoded
   * number, so the badge cannot claim unread items that do not exist.
   */
  const unreadCount = MOCK_DASHBOARD_ALERTS.length;

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
          <span className="lmcs-brand-mark lmcs-brand-mark-compact">
            <Image
              src="/images/digi-pramaan-logo.png"
              alt=""
              width={32}
              height={32}
            />
          </span>
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
          /*
           * The accessible name carries the count, so a screen-reader user gets
           * "3 unread notifications" rather than a bare "Notifications" beside a
           * number they cannot see.
           */
          aria-label={
            unreadCount > 0
              ? t("navigation.notificationsUnread", { count: unreadCount })
              : t("navigation.notifications")
          }
        >
          <span className="ux4g-icon-outlined" aria-hidden="true">
            notifications
          </span>
          {unreadCount > 0 ? (
            <span className="ux4g-badge-digit-primary" aria-hidden="true">
              {unreadCount}
            </span>
          ) : null}
        </button>

        {user ? (
          <div className="lmcs-header-user">
            <span className="ux4g-label-m-default">{user.fullName}</span>
            <span className="ux4g-tag ux4g-tag-tonal-primary ux4g-tag-s">
              <span className="ux4g-icon-outlined" aria-hidden="true">
                badge
              </span>
              {t(`vocabulary.role.${user.role}`)}
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
