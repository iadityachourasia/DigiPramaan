import { MetricCard, Skeleton } from "@/components/shared";
import { ROUTES } from "@/lib/constants";
import { formatCompactNumber, formatSignedPercentage } from "@/lib/utils/format";
import type { KpiMetric } from "@/types";

/**
 * KpiRow — the four KPI cards, 4-up on desktop.
 *
 * 02-dashboard.md §2's four cards are exactly what `MOCK_KPIS` already
 * provides — no fifth "Needs Review" card, matching the spec's explicit list.
 * `PAGE_COMPOSITION.md` §5's "don't default to 4-across regardless of
 * content" is satisfied here because 4 is the content-derived count, not a
 * habit: the spec names exactly four KPIs.
 *
 * Each card links to Compliance Records, pre-filtered by that KPI's status
 * via a query string — Records is still a stub, so the link is correct now
 * and becomes live once Records reads its query string. "Products Scanned"
 * has no single status to filter by, so it links to the unfiltered list.
 *
 * "Pending" carries a caption stating explicitly that it means "awaiting
 * verification," per the spec's requirement that this KPI never read as a
 * vague backlog number — 00-README.md §A is emphatic on exactly this point.
 */

export interface KpiRowProps {
  kpis: readonly KpiMetric[];
  labels: {
    productsScanned: string;
    compliant: string;
    nonCompliant: string;
    pending: string;
    pendingCaption: string;
  };
  locale: string;
  loading?: boolean;
}

function kpiHref(kpi: KpiMetric): string {
  if (!kpi.routesToStatus) return ROUTES.records;
  return `${ROUTES.records}?status=${encodeURIComponent(kpi.routesToStatus)}`;
}

function kpiLabel(id: KpiMetric["id"], labels: KpiRowProps["labels"]): string {
  return labels[id];
}

/**
 * Only Compliant and Non-Compliant have a genuine "better/worse" direction.
 * Products Scanned rising is just more activity, and Pending rising could
 * mean more scans arrived or that verification is falling behind — neither
 * reading is safe to assert, so both stay neutral rather than implied good
 * or bad by colour.
 */
function deltaDirection(kpi: KpiMetric): "up" | "down" | "neutral" {
  if (kpi.id === "compliant") return kpi.deltaPercentage >= 0 ? "up" : "down";
  if (kpi.id === "nonCompliant") return kpi.deltaPercentage <= 0 ? "up" : "down";
  return "neutral";
}

export function KpiRow({ kpis, labels, locale, loading = false }: KpiRowProps) {
  if (loading) {
    return (
      <div className="lmcs-kpi-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="ux4g-card ux4g-card-outline">
            <div className="ux4g-card-body lmcs-metric-card">
              <Skeleton width="60%" height="0.875rem" />
              <Skeleton width="40%" height="1.75rem" />
              <Skeleton width="70%" height="0.875rem" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="lmcs-kpi-grid">
      {kpis.map((kpi) => (
        <MetricCard
          key={kpi.id}
          label={kpiLabel(kpi.id, labels)}
          value={formatCompactNumber(kpi.value, locale)}
          deltaLabel={formatSignedPercentage(kpi.deltaPercentage)}
          deltaDirection={deltaDirection(kpi)}
          href={kpiHref(kpi)}
          {...(kpi.id === "pending" ? { caption: labels.pendingCaption } : {})}
        />
      ))}
    </div>
  );
}
