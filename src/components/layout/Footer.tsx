import { useTranslations } from "next-intl";

/**
 * Footer — the GIGW-mandatory government footer.
 *
 * GIGW guidelines (v3.0) require every Indian government website to show:
 *   - copyright notice with department name
 *   - accessibility statement link
 *   - privacy policy link
 *   - terms of use link
 *   - last-updated date
 *   - "Content owned and maintained by" line
 *
 * All strings come from en.json → footer namespace.
 */

export function Footer() {
  const t = useTranslations("footer");
  const currentYear = new Date().getFullYear().toString();

  return (
    <footer className="lmcs-footer" role="contentinfo">
      <div className="lmcs-footer-inner ux4g-container">
        <div className="lmcs-footer-links">
          <a href="/accessibility" className="lmcs-link ux4g-label-s-default">
            {t("accessibilityStatement")}
          </a>
          <a href="/privacy" className="lmcs-link ux4g-label-s-default">
            {t("privacyPolicy")}
          </a>
          <a href="/terms" className="lmcs-link ux4g-label-s-default">
            {t("termsOfUse")}
          </a>
          <a href="/rti" className="lmcs-link ux4g-label-s-default">
            {t("rti")}
          </a>
          <a href="/help" className="lmcs-link ux4g-label-s-default">
            {t("help")}
          </a>
        </div>

        <div className="lmcs-footer-meta">
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("copyright", { year: currentYear })}
          </p>
          <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {t("contentOwnership")}
          </p>
        </div>
      </div>
    </footer>
  );
}
