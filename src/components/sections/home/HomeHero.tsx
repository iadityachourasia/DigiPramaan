import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/** The supplied product-scanning artwork is decorative; the copy carries the message. */
export async function HomeHero() {
  const t = await getTranslations();

  return (
    <section className="lmcs-section-xl lmcs-hero lmcs-section-elevated">
      <div className="ux4g-container lmcs-hero-grid">
        <div className="lmcs-hero-text">
          <p className="ux4g-label-s-strong lmcs-hero-promises">
            <span>{t("home.hero.promiseFairTrade")}</span>
            <span>{t("home.hero.promiseTrustedMarkets")}</span>
            <span>{t("home.hero.promiseConsumerProtection")}</span>
          </p>
          <p className="ux4g-tag ux4g-tag-tonal-primary ux4g-tag-s">
            {t("home.hero.eyebrow")}
          </p>

          <h1 className="ux4g-display-m-strong lmcs-hero-title">
            {t("home.hero.title")}
          </h1>

          <p className="ux4g-body-l-strong lmcs-hero-body ux4g-text-neutral-secondary">
            {t("home.hero.body")}
          </p>

          <div className="lmcs-hero-actions">
            <Link href={ROUTES.login} className="ux4g-btn ux4g-btn-primary ux4g-btn-lg">
              {t("home.hero.ctaPrimary")}
            </Link>
            <Link
              href={ROUTES.grievance}
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-lg"
            >
              {t("home.hero.ctaSecondary")}
            </Link>
          </div>

          <p className="ux4g-body-s-strong lmcs-hero-trust ux4g-text-neutral-secondary">
            {t("home.hero.trustLine")}
          </p>
        </div>
      </div>

      <div className="lmcs-hero-art" aria-hidden="true" />
    </section>
  );
}
