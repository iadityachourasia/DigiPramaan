import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { ROUTES, SITE_LAST_UPDATED } from "@/lib/constants";

/**
 * Footer — the GIGW-mandatory government footer.
 *
 * BRD §9.4 requires every page to carry: a copyright notice, an accessibility
 * statement link, a privacy policy link, an RTI link, and a last-updated date.
 * Terms of use and help are carried alongside them as GIGW convention.
 *
 * Links go through `Link` from `@/i18n/navigation`, not a raw anchor. A plain
 * `<a href="/privacy">` drops the active locale, so a Hindi visitor would be
 * silently returned to English — the reason the project lints against it.
 *
 * All strings come from the `footer` namespace in the message catalogue.
 */

const FOOTER_LINKS = [
  { href: ROUTES.accessibilityStatement, key: "accessibilityStatement" },
  { href: ROUTES.privacy, key: "privacyPolicy" },
  { href: ROUTES.terms, key: "termsOfUse" },
  { href: ROUTES.rti, key: "rti" },
  { href: ROUTES.help, key: "help" },
] as const;

export function Footer() {
  const t = useTranslations("footer");
  const format = useFormatter();
  const currentYear = new Date().getFullYear().toString();

  return (
    <footer className="lmcs-footer" role="contentinfo">
      <div className="lmcs-footer-inner ux4g-container">
        <nav className="lmcs-footer-links" aria-label={t("navigationLabel")}>
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="lmcs-link ux4g-label-s-default"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="lmcs-footer-meta">
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("copyright", { year: currentYear })}
          </p>
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("contentOwnership")}
          </p>
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("lastUpdated", {
              date: format.dateTime(new Date(SITE_LAST_UPDATED), {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
            })}
          </p>
        </div>
      </div>
    </footer>
  );
}
