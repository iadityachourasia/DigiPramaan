"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { SIDEBAR_NAV } from "@/lib/constants";

/**
 * Sidebar — the primary navigation panel for authenticated pages.
 *
 * Built during the Dashboard page (page 2 in build order), reused by all
 * subsequent authenticated pages via the (auth) route group layout.
 *
 * Navigation items come from SIDEBAR_NAV in constants/routes.ts so paths
 * are defined once. The active item is highlighted by comparing the current
 * pathname against each href.
 *
 * On mobile (<1024 px) the sidebar collapses to a slide-out drawer triggered
 * by the Header's menu button.
 */

export interface SidebarProps {
  /** Whether the mobile drawer is open. Controlled by the Header. */
  mobileOpen: boolean;
  /** Close the mobile drawer (e.g. after a link click). */
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <>
      {/* Overlay for mobile drawer */}
      {mobileOpen ? (
        <div
          className="lmcs-sidebar-overlay"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          role="presentation"
        />
      ) : null}

      <nav
        className={`lmcs-sidebar${mobileOpen ? " lmcs-sidebar-open" : ""}`}
        aria-label={t("navigation.primaryLandmark")}
      >
        <div className="lmcs-sidebar-brand ux4g-py-m ux4g-px-m">
          <span className="ux4g-title-s-strong">{t("app.name")}</span>
          <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("app.descriptor")}
          </span>
        </div>

        <ul className="lmcs-sidebar-nav">
          {SIDEBAR_NAV.map((item) => {
            const isActive = pathname === item.href
              || pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`lmcs-sidebar-link${isActive ? " lmcs-sidebar-link-active" : ""}`}
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
