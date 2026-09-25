import { getTranslations } from "next-intl/server";

/**
 * HomeCredit — a slim, single-line team-attribution strip, the very last
 * thing on the landing page before the GIGW-mandatory `Footer` (rendered by
 * `(public)/layout.tsx`, shared across login/grievance/home alike). Kept
 * here, in the page itself, specifically so this attribution appears only
 * on the home page — the shared `Footer` is deliberately left untouched.
 *
 * Deliberately minimal, matching `HomeFinalCta`'s own restraint: one icon,
 * one line. Not a section — no heading, no background change of its own
 * (a thin top border is enough to separate it from Final CTA above).
 */

export async function HomeCredit() {
  const t = await getTranslations("home.credit");

  return (
    <div className="lmcs-home-credit">
      <div className="ux4g-container lmcs-home-credit-inner">
        <span className="ux4g-icon-outlined" aria-hidden="true">
          badge
        </span>
        <p className="ux4g-label-m-default">
          {t("text")} <strong className="ux4g-label-m-strong">{t("team")}</strong>
          <span className="lmcs-home-credit-sep" aria-hidden="true">
            ·
          </span>
          {t("leader")}
        </p>
      </div>
    </div>
  );
}
