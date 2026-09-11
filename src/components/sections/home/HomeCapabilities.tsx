import { getTranslations } from "next-intl/server";

/**
 * HomeCapabilities — the eight things the platform does, one card each.
 *
 * A distinct concept from `HomeServices` (which is about how a product
 * *reaches* the system — field inspection, e-commerce, citizen report), so
 * this is a separate section rather than a repurposing of those cards.
 * Reuses the same `.lmcs-feature-card`/`.lmcs-feature-icon` shell as
 * `HomeServices`, just a wider grid and no per-card CTA — these are facts
 * about the product, not doors to click through.
 */

const ITEMS = [
  { key: "scan", icon: "document_scanner" },
  { key: "rules", icon: "gavel" },
  { key: "fontSize", icon: "straighten" },
  { key: "evidence", icon: "fact_check" },
  { key: "reports", icon: "summarize" },
  { key: "history", icon: "history" },
  { key: "risk", icon: "bar_chart" },
  { key: "enforcement", icon: "flag" },
] as const;

export async function HomeCapabilities() {
  const t = await getTranslations("home.capabilities");

  return (
    <section className="lmcs-section lmcs-section-elevated">
      <div className="ux4g-container">
        <div className="lmcs-section-head">
          <h2 className="ux4g-heading-l-strong">{t("heading")}</h2>
          <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
            {t("body")}
          </p>
        </div>

        <div className="lmcs-cards-4">
          {ITEMS.map((item) => (
            <article
              key={item.key}
              className="ux4g-card ux4g-card-outline lmcs-feature-card-shell"
            >
              <div className="ux4g-card-body lmcs-feature-card">
                <span className="lmcs-feature-icon">
                  <span className="ux4g-icon-outlined" aria-hidden="true">
                    {item.icon}
                  </span>
                </span>

                <h3 className="ux4g-title-m-strong">
                  {t(`items.${item.key}.title`)}
                </h3>
                <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
                  {t(`items.${item.key}.body`)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
