import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * HomeFinalCta — the page's closing call to action, for the officer reader
 * who scrolled all the way down without acting on the Hero's own CTA.
 *
 * The one filled-primary button on this section (`HomeCitizens`, directly
 * above, already spends its own section's filled-primary budget on a
 * citizen-facing action) — reuses the existing login flow exactly, no new
 * auth logic. Kept deliberately slim: one heading, one line, one button —
 * this closes the page, it does not restate the Hero's full pitch.
 */

export async function HomeFinalCta() {
  const t = await getTranslations("home.finalCta");

  return (
    <section className="lmcs-section lmcs-section-default">
      <div className="ux4g-container lmcs-final-cta">
        <h2 className="ux4g-heading-l-strong">{t("heading")}</h2>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
          {t("body")}
        </p>
        <Link href={ROUTES.login} className="ux4g-btn ux4g-btn-primary ux4g-btn-lg">
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
