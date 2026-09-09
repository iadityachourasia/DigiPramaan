"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { SIDEBAR_NAV } from "@/lib/constants";
import { useAuth } from "@/lib/hooks";
import { can } from "@/types";

/**
 * Sidebar — primary navigation for authenticated pages.
 *
 * Items are filtered against the Role Permission Matrix. See `SIDEBAR_NAV` in
 * `src/lib/constants/routes.ts` for the gate on each entry and the reasoning.
 *
 * Filtering uses the pure `can(role, permission)` rather than the `usePermission`
 * hook. `usePermission` calls `useAuth` internally, so calling it once per nav
 * item would be a hook inside a loop — a rules-of-hooks violation that would
 * fail lint at `--max-warnings=0`. `usePermission` remains the right tool for a
 * single element's gate; this is a list.
 *
 * On viewports below 1024px the sidebar is a slide-out drawer opened from the
 * Header's menu button.
 */

export interface SidebarProps {
  /** Whether the mobile drawer is open. Controlled by AppShell. */
  mobileOpen: boolean;
  /** Close the mobile drawer (after a link click, Escape, or overlay click). */
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user } = useAuth();

  const items = useMemo(
    () =>
      SIDEBAR_NAV.filter(
        (item) =>
          !item.permission || (user != null && can(user.role, item.permission))
      ),
    [user]
  );

  /*
   * Escape closes the drawer.
   *
   * The previous implementation put `onKeyDown` on the overlay div. That never
   * fired: a plain div is not focusable, so it never receives key events. A
   * document-level listener is what actually works, and it is scoped to only
   * exist while the drawer is open.
   */
  useEffect(() => {
    if (!mobileOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      {mobileOpen ? (
        /*
         * Presentational: it dims the page and swallows clicks. Escape is
         * handled above and every destination is reachable from the nav itself,
         * so this needs no keyboard affordance of its own.
         */
        <div
          className="lmcs-sidebar-overlay"
          onClick={onClose}
          role="presentation"
        />
      ) : null}

      <nav
        className={`lmcs-sidebar${mobileOpen ? " lmcs-sidebar-open" : ""}`}
        aria-label={t("navigation.primaryLandmark")}
      >
        <div className="lmcs-sidebar-brand ux4g-py-m ux4g-px-m">
          <div className="lmcs-sidebar-brand-row">
            <span className="lmcs-brand-mark lmcs-brand-mark-compact">
              <Image
                src="/images/digi-pramaan-logo.png"
                alt=""
                width={28}
                height={28}
              />
            </span>
            <div className="lmcs-sidebar-brand-titles">
              <span className="ux4g-title-s-strong">{t("app.name")}</span>
              <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                {t("app.descriptor")}
              </span>
            </div>
          </div>
        </div>

        <ul className="lmcs-sidebar-nav">
          {items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`lmcs-sidebar-link${
                    isActive ? " lmcs-sidebar-link-active" : ""
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onClose}
                >
                  <span className="ux4g-icon-outlined" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="ux4g-label-m-default">
                    {t(item.labelKey)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="lmcs-sidebar-footer ux4g-px-m ux4g-py-s">
          <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("app.department")}
          </span>
        </div>
      </nav>
    </>
  );
}
