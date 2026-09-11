import { getTranslations } from "next-intl/server";

/**
 * HomeValueStrip — four short claims about how the tool behaves, directly
 * under the Hero.
 *
 * Deliberately not a card grid: this is a footnote to the Hero's own pitch,
 * not a second section competing for attention, so it carries no section
 * heading and no background change of its own (it inherits the page's base
 * background rather than declaring `lmcs-section-default`/`-elevated`,
 * keeping it visually part of the Hero's zone rather than its own rhythm
 * step). It is separate from `home.hero.trustLine`, which is the statutory
 * department-attribution line and stays exactly where it is.
 */

const ITEMS = [
  { key: "extraction", icon: "auto_awesome" },
  { key: "ruleEngine", icon: "gavel" },
  { key: "evidence", icon: "fact_check" },
  { key: "officerControl", icon: "badge" },
] as const;

export async function HomeValueStrip() {
  const t = await getTranslations("home.valueStrip");

  return (
    <section className="lmcs-value-strip-section">
      <div className="ux4g-container">
        <ul className="lmcs-value-strip">
          {ITEMS.map((item) => (
            <li key={item.key} className="lmcs-value-strip-item">
              <span className="ux4g-icon-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span className="ux4g-label-m-default">
                {t(`items.${item.key}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
