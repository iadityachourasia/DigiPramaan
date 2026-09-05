import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * HomeServices — the three intake routes, 3-up on desktop.
 *
 * Every card's action is a text button. PAGE_COMPOSITION §0 allows exactly one
 * filled primary per screen section, and three side-by-side filled buttons would
 * read as three competing primary actions rather than three equal doors.
 */

const SERVICES = [
  { key: "inspection", icon: "photo_camera", href: ROUTES.login },
  { key: "ecommerce", icon: "shopping_cart", href: ROUTES.login },
  { key: "grievance", icon: "campaign", href: ROUTES.grievance },
] as const;

export async function HomeServices() {
  const t = await getTranslations("home.services");

  return (
    <section className="lmcs-section lmcs-section-default">
      <div className="ux4g-container">
        <div className="lmcs-section-head">
          <h2 className="ux4g-heading-l-strong">{t("heading")}</h2>
          <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
            {t("body")}
          </p>
        </div>

        <div className="lmcs-cards-3">
          {SERVICES.map((service) => (
            <article key={service.key} className="ux4g-card ux4g-card-outline">
              <div className="ux4g-card-body lmcs-feature-card">
                <span className="lmcs-feature-icon">
                  <span className="ux4g-icon-outlined" aria-hidden="true">
                    {service.icon}
                  </span>
                </span>

                <h3 className="ux4g-title-m-strong">
                  {t(`${service.key}.title`)}
                </h3>
                <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
                  {t(`${service.key}.body`)}
                </p>

                <Link
                  href={service.href}
                  className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                >
                  {t(`${service.key}.cta`)}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
