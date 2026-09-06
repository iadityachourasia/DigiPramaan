import { EmptyState, ErrorState, Skeleton } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { DashboardAlert } from "@/types";

/**
 * AlertsPanel — violation spikes and repeat-offender flags.
 *
 * Each alert renders through the shared `Alert` component — `COMPONENT_SPEC.md`'s
 * Alert/Banner recipe names a custom-styled div banner as an anti-pattern, so
 * this is one `Alert` per item rather than bespoke markup. Severity comes
 * straight from `DashboardAlert.severity`, never defaulted to "error" (02
 * §6's explicit requirement), and the message text is used as-is: it already
 * carries the canonical taxonomy wording where it names a violation (e.g.
 * "MRP Non-Compliance"), so re-running it through i18n would risk
 * paraphrasing a string 00-README.md §B forbids paraphrasing.
 */

export interface AlertsPanelProps {
  alerts: readonly DashboardAlert[];
  labels: {
    heading: string;
    emptyTitle: string;
    emptyBody: string;
    errorTitle: string;
    errorBody: string;
    retryLabel: string;
    viewAction: string;
  };
  demoState?: "loading" | "empty" | "error";
}

export function AlertsPanel({ alerts, labels, demoState }: AlertsPanelProps) {
  return (
    <div className="ux4g-card ux4g-card-outline">
      <div className="ux4g-card-body lmcs-dashboard-section">
        <h2 className="ux4g-title-m-strong">{labels.heading}</h2>

        {demoState === "loading" ? (
          <div className="lmcs-alerts-list">
            <Skeleton height="3.5rem" />
            <Skeleton height="3.5rem" />
          </div>
        ) : demoState === "error" ? (
          <ErrorState
            title={labels.errorTitle}
            description={labels.errorBody}
            action={
              <Link
                href={ROUTES.dashboard}
                className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
              >
                {labels.retryLabel}
              </Link>
            }
          />
        ) : demoState === "empty" || alerts.length === 0 ? (
          <EmptyState icon="notifications_off" title={labels.emptyTitle} description={labels.emptyBody} />
        ) : (
          <div className="lmcs-alerts-list">
            {alerts.map((alert) => (
              <Alert
                key={alert.id}
                severity={alert.severity}
                actions={
                  <Link
                    href={alert.href}
                    className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                    aria-label={`${labels.viewAction}: ${alert.message}`}
                  >
                    {labels.viewAction}
                  </Link>
                }
              >
                {alert.message}
              </Alert>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
