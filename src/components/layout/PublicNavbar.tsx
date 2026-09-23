"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { DigiPramaanLogo } from "@/components/shared";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { ROUTES } from "@/lib/constants";

const SECTION_LINKS = [
  { href: "/", key: "home" },
  { href: "#how-it-works", key: "howItWorks" },
  { href: "#what-we-check", key: "categories" },
  { href: "#for-citizens", key: "citizens" },
  { href: ROUTES.help, key: "resources" },
  { href: `${ROUTES.help}#support-heading`, key: "contact" },
] as const;

/** The landing page's one-row product identity, navigation and officer entry. */
export function PublicNavbar() {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchDialog = useRef<HTMLDialogElement>(null);
  const searchResults = SECTION_LINKS.filter((link) =>
    t(`home.nav.${link.key}`)
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );

  return (
    <nav className="ux4g-navbar lmcs-navbar" aria-label={t("home.nav.label")}>
      <div className="ux4g-container ux4g-navbar-wrap lmcs-navbar-inner">
        <Link
          href="/"
          className="lmcs-masthead-brand lmcs-navbar-brand"
          aria-label={t("app.name")}
        >
          <DigiPramaanLogo size="nav" />
          <span className="lmcs-masthead-titles">
            <span className="ux4g-title-l-strong">{t("app.name")}</span>
            <span className="ux4g-body-m-default ux4g-text-neutral-secondary">
              {t("app.descriptor")}
            </span>
          </span>
        </Link>

        <ul
          id="landing-navigation"
          className={`ux4g-navbar-links lmcs-navbar-links${menuOpen ? " lmcs-navbar-links-open" : ""}`}
        >
          {SECTION_LINKS.map((link) => (
            <li key={link.key}>
              {link.href.startsWith("#") ? (
                <a
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="lmcs-navbar-link ux4g-label-l-default"
                >
                  {t(`home.nav.${link.key}`)}
                </a>
              ) : (
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`lmcs-navbar-link ux4g-label-l-default${link.key === "home" ? " lmcs-navbar-link-active" : ""}`}
                  aria-current={link.key === "home" ? "page" : undefined}
                >
                  {t(`home.nav.${link.key}`)}
                </Link>
              )}
            </li>
          ))}
        </ul>

        <div className="ux4g-navbar-right lmcs-navbar-actions">
          <ThemeToggle variant="outline" />
          <button
            type="button"
            className="ux4g-icon-btn ux4g-icon-btn-outline-primary ux4g-icon-btn-lg lmcs-nav-search"
            aria-label={t("home.nav.search")}
            onClick={() => {
              setQuery("");
              searchDialog.current?.showModal();
              searchDialog.current?.querySelector("input")?.focus();
            }}
          >
            <span className="ux4g-icon-outlined" aria-hidden="true">
              search
            </span>
          </button>
          <Link
            href={ROUTES.login}
            className="ux4g-btn ux4g-btn-primary ux4g-btn-lg lmcs-nav-signin"
          >
            {t("home.nav.signIn")}
            <span className="ux4g-icon-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
          <button
            type="button"
            className="ux4g-icon-btn ux4g-icon-btn-outline-primary ux4g-icon-btn-md lmcs-nav-menu-button"
            aria-label={
              menuOpen ? t("accessibility.closeMenu") : t("accessibility.openMenu")
            }
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="ux4g-icon-outlined" aria-hidden="true">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      <dialog
        ref={searchDialog}
        className="lmcs-site-search"
        aria-label={t("home.nav.search")}
      >
        <div className="lmcs-site-search-head">
          <h2 className="ux4g-heading-s-strong">{t("home.nav.search")}</h2>
          <button
            type="button"
            className="ux4g-icon-btn ux4g-icon-btn-text-primary ux4g-icon-btn-md"
            aria-label={t("common.actions.close")}
            onClick={() => searchDialog.current?.close()}
          >
            <span className="ux4g-icon-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <label htmlFor="site-search-input" className="ux4g-label-l-strong">
          {t("home.nav.searchLabel")}
        </label>
        <div className="ux4g-search-container ux4g-search-m">
          <input
            id="site-search-input"
            type="search"
            aria-label={t("home.nav.searchLabel")}
            className="ux4g-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("home.nav.searchPlaceholder")}
          />
        </div>
        <ul className="lmcs-site-search-results">
          {searchResults.map((link) => (
            <li key={link.key}>
              <Link
                href={link.href}
                onClick={() => searchDialog.current?.close()}
                className="lmcs-site-search-result ux4g-body-m-default"
              >
                {t(`home.nav.${link.key}`)}{" "}
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {searchResults.length === 0 ? (
          <p className="ux4g-body-s-default">{t("home.nav.noResults")}</p>
        ) : null}
      </dialog>
    </nav>
  );
}
