import type { ScrapedListing } from "@/types";

/**
 * ListingStatusBadge — a batch queue item's own status
 * (08-ecommerce-listing-scanner.md §6: "icon + label exactly like every
 * other status indicator in the system"). Mirrors `StatusBadge`'s exact
 * structure rather than reusing it, since that one is typed to
 * `ComplianceStatus` — a different vocabulary from this queue's
 * queued/scanning/done/failed, which describes a pipeline run's progress
 * rather than a record's compliance.
 */

type ListingStatus = ScrapedListing["status"];

const STATUS_CLASS: Record<ListingStatus, string> = {
  queued: "ux4g-tag-tonal-neutral",
  scanning: "ux4g-tag-tonal-info",
  done: "ux4g-tag-tonal-success",
  failed: "ux4g-tag-tonal-error",
};

const STATUS_ICON: Record<ListingStatus, string> = {
  queued: "schedule",
  scanning: "document_scanner",
  done: "check_circle",
  failed: "error",
};

export interface ListingStatusBadgeProps {
  status: ListingStatus;
  label: string;
}

export function ListingStatusBadge({ status, label }: ListingStatusBadgeProps) {
  return (
    <span className={`${STATUS_CLASS[status]} ux4g-tag-s lmcs-status-badge lmcs-status-badge-pill`}>
      <span className="ux4g-icon-outlined" aria-hidden="true">
        {STATUS_ICON[status]}
      </span>
      <span className="ux4g-label-s-default">{label}</span>
    </span>
  );
}
