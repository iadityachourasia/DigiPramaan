import { getTranslations } from "next-intl/server";

import { VIOLATION_TAXONOMY } from "@/types";

/**
 * HomeTaxonomy — the ten categories every finding is reported as.
 *
 * Rendered by mapping `VIOLATION_TAXONOMY` and reading the existing
 * `violationTaxonomy.*` message keys, so this section carries zero new copy and
 * cannot drift from the verification screen, the compliance record, the
 * analytics breakdown or the manufacturer scorecard — the four other places
 * `00-README.md` §B requires the same wording.
 *
 * That constraint is also the reason the section is worth having: showing the
 * actual rule citations is far more convincing evidence of domain depth than a
 * generic "AI-powered compliance" claim would be.
 */
export async function HomeTaxonomy() {
  const t = await getTranslations();

  return (
    <section
      id="what-we-check"
      className="lmcs-section-xl lmcs-section-default"
    >
      <div className="ux4g-container lmcs-split">
        <div className="lmcs-split-main">
          <div className="lmcs-section-head">
            <h2 className="ux4g-heading-l-strong">
              {t("home.taxonomy.heading")}
            </h2>
            <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
              {t("home.taxonomy.body")}
            </p>
          </div>

          <ul className="lmcs-tag-cloud">
            {VIOLATION_TAXONOMY.map((entry) => (
              <li key={entry.id}>
                <span className="ux4g-tag ux4g-tag-outline-neutral ux4g-tag-s">
                  {t(`violationTaxonomy.${entry.id}.category`)}
                  {entry.legalBasis === "—" ? null : (
                    <>
                      {" · "}
                      {t(`violationTaxonomy.${entry.id}.legalBasis`)}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="lmcs-split-aside ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body">
            <h3 className="ux4g-title-m-strong">
              {t("home.taxonomy.provenanceTitle")}
            </h3>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary ux4g-mt-s">
              {t("home.taxonomy.provenanceBody")}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
