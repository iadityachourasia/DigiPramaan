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
          {/*
            A raw anchor is correct here (like the skip-link in PublicLayout):
            the target is an external, cross-origin URL, not an internal
            route, so there is no locale to carry and `Link` would be wrong.
          */}
          <a
            href="https://github.com/iadityachourasia/DigiPramaan"
            target="_blank"
            rel="noopener noreferrer"
            className="ux4g-icon-btn ux4g-icon-btn-outline-primary ux4g-icon-btn-lg lmcs-nav-github"
            aria-label={t("home.nav.github")}
            title={t("home.nav.github")}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
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
