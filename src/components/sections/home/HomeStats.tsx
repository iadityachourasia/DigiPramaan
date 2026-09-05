import { getTranslations } from "next-intl/server";

/**
 * HomeStats — what the Rules require, as four figures.
 *
 * Every number here is true by construction rather than measured: ten violation
 * categories because the taxonomy has ten, seven declarations because
 * `DECLARATION_FIELDS` has seven, three access levels because the Role
 * Permission Matrix names three, and 2011 because that is the year of the Rules.
 *
 * Deliberately no usage metrics. A government landing page claiming "12,000
 * products scanned" before the system has scanned anything is a credibility
 * liability, and the figures above cannot go stale or be wrong.
 *
 * The figure uses neutral text, not brand. Four brand-coloured numbers across a
 * full-width band would spend most of the page's brand budget on decoration
 * rather than on the primary action.
 */

const STATS = ["categories", "declarations", "roles", "rules"] as const;

export async function HomeStats() {
  const t = await getTranslations("home.stats");

  return (
    <section className="lmcs-section lmcs-section-default">
      <div className="ux4g-container">
        <h2 className="ux4g-sr-only">{t("heading")}</h2>

        <dl className="lmcs-stats-grid">
          {STATS.map((stat) => (
            <div key={stat} className="lmcs-stat">
              <dt className="ux4g-heading-l-strong">{t(`${stat}.value`)}</dt>
              <dd className="ux4g-label-m-default ux4g-text-neutral-secondary">
                {t(`${stat}.label`)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
