import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { findMockRecord } from "@/lib/mock";
import type { DeclarationCheck } from "@/types";

/**
 * HomeHero — identity, the one primary action, and proof of what the tool does.
 *
 * PAGE_COMPOSITION §1: text on columns 1–6, visual on 7–12, exactly one filled
 * primary button, no 100vh lock. Height comes from `Section/XL` padding and a
 * clamped minimum on the visual column, so the fold stays around 60–70% of the
 * viewport without pinning to it.
 *
 * The visual is the product's own extraction panel, not an illustration. It is
 * driven by a real record from `src/lib/mock`, so the field names come from the
 * same `declarationField` catalogue the verification screen uses and the
 * verdicts come from the same checklist shape the rule engine produces. It
 * cannot drift from the product, and the manufacturers in that data are
 * deliberately fictional so no real company appears non-compliant.
 */

/** Rows shown in the sample panel. Five fits the column without scrolling. */
const VISIBLE_ROWS = 5;

export async function HomeHero() {
  const t = await getTranslations();

  /*
   * rec-1002 is the seeded record that passes most checks and fails two.
   *
   * The rows shown are chosen so both failures appear alongside enough passes
   * to fill the panel. Taking the first five in checklist order would have
   * shown five passes and a 5/5 score for a record whose Compliance Status is
   * Non-Compliant — a screenshot that contradicts the product's own data model
   * is worse than no screenshot.
   */
  const record = findMockRecord("rec-1002");
  const checklist = record?.checklist ?? [];
  const failed = checklist.filter((row) => !row.passed);
  const rows: DeclarationCheck[] = [
    ...checklist.filter((row) => row.passed).slice(0, VISIBLE_ROWS - failed.length),
    ...failed,
  ].slice(0, VISIBLE_ROWS);
  const passed = rows.filter((row) => row.passed).length;

  return (
    <section className="lmcs-section-xl lmcs-section-elevated">
      <div className="ux4g-container lmcs-hero-grid">
        <div className="lmcs-hero-text">
          <p className="ux4g-tag ux4g-tag-tonal-primary ux4g-tag-s">
            {t("home.hero.eyebrow")}
          </p>

          <h1 className="lmcs-hero-title ux4g-heading-2xl-strong">
            {t("home.hero.title")}
          </h1>

          <p className="lmcs-hero-body ux4g-body-l-default ux4g-text-neutral-secondary">
            {t("home.hero.body")}
          </p>

          <div className="lmcs-hero-actions">
            {/* The single filled primary action on this screen. */}
            <Link
              href={ROUTES.login}
              className="ux4g-btn ux4g-btn-primary ux4g-btn-lg"
            >
              {t("home.hero.ctaPrimary")}
            </Link>
            <Link
              href={ROUTES.grievance}
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-lg"
            >
              {t("home.hero.ctaSecondary")}
            </Link>
          </div>

          <p className="lmcs-hero-trust ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("home.hero.trustLine")}
          </p>
        </div>

        <div className="lmcs-hero-visual">
          {/*
            Decorative in the accessibility sense: everything it conveys is
            stated in the surrounding copy, and reading a sample record row by
            row would be noise to a screen-reader user. Hidden rather than
            given invented alt text.
          */}
          <div className="lmcs-demo" aria-hidden="true">
            <div className="lmcs-demo-head">
              <span className="ux4g-label-m-default ux4g-text-neutral-secondary">
                {t("home.hero.demoCaption")}
              </span>
              <span className="ux4g-tag ux4g-tag-tonal-neutral ux4g-tag-s">
                {record?.scanId}
              </span>
            </div>

            {/*
              A miniature version of the same flow HomePipeline explains in full
              below — this is what a judge sees first, so the "photo in, verified
              record out" shape should be visible before they scroll.
            */}
            <div className="lmcs-demo-flow">
              {(["scan", "ocr", "rules", "verified"] as const).map((step, index, arr) => (
                <span key={step} className="lmcs-demo-flow-step">
                  <span className="ux4g-tag ux4g-tag-outline-neutral ux4g-tag-s">
                    {t(`home.hero.demoFlow.${step}`)}
                  </span>
                  {index < arr.length - 1 ? (
                    <span className="ux4g-icon-outlined lmcs-demo-flow-arrow">
                      chevron_right
                    </span>
                  ) : null}
                </span>
              ))}
            </div>

            <div className="lmcs-demo-body">
              {rows.map((row) => (
                <div key={row.fieldId} className="lmcs-demo-row">
                  <span className="lmcs-demo-field">
                    <span
                      className={`ux4g-icon-outlined ${
                        row.passed
                          ? "ux4g-icon-success"
                          : "ux4g-icon-error"
                      }`}
                    >
                      {row.passed ? "check_circle" : "cancel"}
                    </span>
                    <span className="lmcs-demo-field-name ux4g-body-s-default">
                      {t(`declarationField.${row.fieldId}`)}
                    </span>
                  </span>
                  <span
                    className={`ux4g-tag ux4g-tag-s ${
                      row.passed
                        ? "ux4g-tag-tonal-success"
                        : "ux4g-tag-tonal-error"
                    }`}
                  >
                    {row.passed
                      ? t("home.hero.demoVerdictPass")
                      : t("home.hero.demoVerdictFail")}
                  </span>
                </div>
              ))}
            </div>

            <div className="lmcs-demo-foot">
              <span className="ux4g-heading-m-strong">
                {passed}/{rows.length}
              </span>
              <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
                {t("home.hero.demoScoreLabel")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
