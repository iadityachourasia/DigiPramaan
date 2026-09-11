"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * PublicNavbar — the landing page's own navigation.
 *
 * Rendered by the landing page rather than the `(public)` layout, so it does not
 * leak onto Login, which `01-login.md` requires be free of shell navigation.
 *
 * Carries no logo/wordmark of its own: `PublicMasthead`, rendered immediately
 * above this on every public page, now carries the DigiPramaan product mark —
 * repeating it here, a few dozen pixels below, would just be duplicated
 * branding. This navbar's job is purely the in-page section links and the
 * sign-in CTA.
 *
 * The three destinations are in-page fragments, so they use raw anchors. That is
 * correct and is not the locale-dropping bug the project lints against: a
 * fragment has no route to carry a locale on. Only `ROUTES.login` goes through
 * `Link`.
 *
 * Client-side because the anchors need smooth-scroll behaviour to be suppressed
 * under `prefers-reduced-motion`, which CSS already handles globally — but the
 * component is also the natural place for a future mobile menu, so the boundary
 * is drawn here.
 */

const SECTION_LINKS = [
  { href: "#how-it-works", key: "howItWorks" },
  { href: "#what-we-check", key: "categories" },
  { href: "#for-citizens", key: "citizens" },
] as const;

export function PublicNavbar() {
  const t = useTranslations();

  return (
    <header className="lmcs-navbar">
      <div className="ux4g-container lmcs-navbar-inner">
        <nav className="lmcs-navbar-links" aria-label={t("home.nav.label")}>
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="lmcs-navbar-link ux4g-label-l-default"
            >
              {t(`home.nav.${link.key}`)}
            </a>
          ))}
        </nav>

        {/*
          Outlined, not filled. The hero below carries the one filled primary
          button on this screen; two filled brand buttons pointing at the same
          destination would flatten the hierarchy PAGE_COMPOSITION §0 asks for.
        */}
        <Link
          href={ROUTES.login}
          className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
        >
          {t("home.nav.signIn")}
        </Link>
      </div>
    </header>
  );
}
