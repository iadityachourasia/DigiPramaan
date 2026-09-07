import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { formatShortDate } from "@/lib/utils/format";
import type { ManufacturerScorecard } from "@/types";

/**
 * ScorecardCard — one manufacturer in the list grid (09 §2).
 *
 * The whole card is one link, so there is never a nested control inside an
 * anchor. The repeat-violation state is shown as an icon-plus-text row
 * rather than a colour treatment on the card itself — same reasoning as
 * `RepeatViolationFlag`, and a manufacturer under the threshold shows
 * nothing in its place.
 */

export interface ScorecardCardProps {
  scorecard: ManufacturerScorecard;
  locale: string;
  labels: {
    productsScanned: string;
    complianceRate: string;
    lastScanned: string;
    never: string;
    repeatViolation: string;
  };
}

export function ScorecardCard({ scorecard, locale, labels }: ScorecardCardProps) {
  const { summary, repeatViolationFlagged } = scorecard;

  return (
    <Link
      href={ROUTES.manufacturerDetail(summary.id)}
      className="ux4g-card ux4g-card-outline lmcs-scorecard-card"
    >
      <div className="ux4g-card-body lmcs-scorecard-card-body">
        <span className="ux4g-title-s-strong">{summary.name}</span>

        <dl className="lmcs-scorecard-card-stats">
          <div>
            <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {labels.productsScanned}
            </dt>
            <dd className="ux4g-heading-s-strong">{summary.totalProductsScanned}</dd>
          </div>
          <div>
            <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {labels.complianceRate}
            </dt>
            <dd className="ux4g-heading-s-strong">{summary.complianceRatePercentage}%</dd>
          </div>
        </dl>

        <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {labels.lastScanned}:{" "}
          {summary.lastScannedAt ? formatShortDate(summary.lastScannedAt, locale) : labels.never}
        </span>

        {repeatViolationFlagged ? (
          <span className="lmcs-scorecard-card-flag ux4g-body-s-default ux4g-text-error">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              error
            </span>
            {labels.repeatViolation}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
