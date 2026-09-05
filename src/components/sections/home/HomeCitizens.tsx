import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * HomeCitizens — the public reporting channel.
 *
 * The page's second filled primary button, and the reason that is allowed:
 * PAGE_COMPOSITION §0 permits one filled primary *per screen section*, not per
 * page. This section is a full screenful with its own goal, and the hero's
 * button is long out of view by the time a reader reaches it.
 *
 * The copy leads with what a citizen would actually notice on a pack — a missing
 * price, no manufacturer named, text too small to read — rather than the
 * taxonomy's legal wording, which a shopper has no reason to know.
 */

const STEPS = ["submit", "review", "outcome"] as const;

export async function HomeCitizens() {
  const t = await getTranslations("home.citizens");

  return (
    <section id="for-citizens" className="lmcs-section-xl lmcs-section-default">
      <div className="ux4g-container lmcs-split">
        <div className="lmcs-split-main">
          <div className="lmcs-section-head">
            <h2 className="ux4g-heading-l-strong">{t("heading")}</h2>
            <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
              {t("body")}
            </p>
          </div>

          <Link
            href={ROUTES.grievance}
            className="ux4g-btn ux4g-btn-primary ux4g-btn-lg"
          >
            {t("cta")}
          </Link>
        </div>

        <ol className="lmcs-split-aside lmcs-steps">
          {STEPS.map((step, index) => (
            <li key={step} className="lmcs-step">
              <span className="lmcs-step-index ux4g-label-m-default" aria-hidden="true">
                {index + 1}
              </span>
              <span className="lmcs-step-text">
                <span className="ux4g-title-s-strong">
                  {t(`steps.${step}.title`)}
                </span>
                <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
                  {t(`steps.${step}.body`)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
