import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  MOCK_ACTIVE_RECORDS,
  MOCK_KPIS,
  MOCK_SCORECARDS,
  MOCK_USERS,
} from "@/lib/mock";
import { COMPLIANCE_STATUSES, VIOLATION_TAXONOMY } from "@/types";

/**
 * PHASE 1 FOUNDATION CHECK — SCAFFOLDING, NOT A PRODUCT PAGE.
 *
 * None of the eleven pages in Pages_Userflow exist yet, and IMPLEMENTATION_GUIDE.md
 * says not to build one until this foundation is confirmed. But "confirmed" cannot
 * mean "asserted in prose": VISUAL_QA_LOOP.md §3 is explicit that reasoning about
 * code is not the same as looking at the render. This route exists so Phase 1 can
 * actually be loaded in a browser and screenshotted, proving four things at once:
 *
 *   1. the UX4G stylesheet resolves and its component classes apply,
 *   2. the semantic tokens paint, in both themes,
 *   3. the locale provider and message files load,
 *   4. the derived mock data agrees with the rules that define it.
 *
 * Phase 2 deletes this file and replaces it with the real root route, which
 * redirects to Login or Dashboard depending on session state. Nothing here is
 * intended to survive, and nothing here is composed against a PAGE_COMPOSITION.md
 * archetype, because it is not a page in the product.
 */
export default async function FoundationCheckPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const statusCounts = COMPLIANCE_STATUSES.map((status) => ({
    status,
    count: MOCK_ACTIVE_RECORDS.filter((r) => r.complianceStatus === status).length,
  }));

  const flaggedManufacturers = MOCK_SCORECARDS.filter(
    (card) => card.repeatViolationFlagged
  );

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <header className="ux4g-mb-xl">
        <p className="ux4g-label-l-default ux4g-text-neutral-secondary">
          {t("app.department")}
        </p>
        <h1 className="ux4g-heading-xl-strong">{t("app.name")}</h1>
        <p className="ux4g-title-s-default ux4g-text-neutral-secondary">
          {t("app.descriptor")}
        </p>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("app.tagline")}
        </p>
      </header>

      <section className="ux4g-mb-xl" aria-labelledby="foundation-heading">
        <h2 id="foundation-heading" className="ux4g-heading-m-strong ux4g-mb-m">
          Phase 1 foundation check
        </h2>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">
          Scaffolding route. Phase 2 replaces it with the real root redirect. If the
          type below is Noto Sans and the surfaces below are separated, the UX4G
          stylesheet and its tokens are wired correctly.
        </p>
      </section>

      <section className="ux4g-mb-xl" aria-labelledby="status-heading">
        <h2 id="status-heading" className="ux4g-heading-s-strong ux4g-mb-m">
          Compliance status vocabulary and derived counts
        </h2>
        <ul className="ux4g-list">
          {statusCounts.map(({ status, count }) => (
            <li key={status} className="ux4g-body-m-default">
              <strong>{t(`vocabulary.complianceStatus.${status}`)}</strong>
              {": "}
              {count}
              {" — "}
              <span className="ux4g-text-neutral-secondary">
                {t(`vocabulary.complianceStatusHint.${status}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ux4g-mb-xl" aria-labelledby="taxonomy-heading">
        <h2 id="taxonomy-heading" className="ux4g-heading-s-strong ux4g-mb-m">
          Canonical violation taxonomy
        </h2>
        <ol className="ux4g-list">
          {VIOLATION_TAXONOMY.map((entry) => (
            <li key={entry.id} className="ux4g-body-m-default">
              {t(`violationTaxonomy.${entry.id}.category`)}
              {" — "}
              <span className="ux4g-text-neutral-secondary">
                {t(`violationTaxonomy.${entry.id}.legalBasis`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ux4g-mb-xl" aria-labelledby="data-heading">
        <h2 id="data-heading" className="ux4g-heading-s-strong ux4g-mb-m">
          Mock data
        </h2>
        <ul className="ux4g-list">
          <li className="ux4g-body-m-default">
            Seeded accounts: {MOCK_USERS.map((user) => user.role).join(", ")}
          </li>
          <li className="ux4g-body-m-default">
            Active compliance records: {MOCK_ACTIVE_RECORDS.length}
          </li>
          <li className="ux4g-body-m-default">
            Dashboard KPI cards: {MOCK_KPIS.length}
          </li>
          <li className="ux4g-body-m-default">
            Manufacturers over the repeat-violation threshold:{" "}
            {flaggedManufacturers.length === 0
              ? "none"
              : flaggedManufacturers
                  .map((card) => card.summary.name)
                  .join(", ")}
          </li>
        </ul>
      </section>
    </main>
  );
}
