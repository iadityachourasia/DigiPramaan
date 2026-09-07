import Image from "next/image";

import { DataTable, type DataTableColumn } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { ScrapedListing } from "@/types";

import { ListingStatusBadge } from "./ListingStatusBadge";

/**
 * BatchQueueTable — the bulk-mode queue (08 §2). Reuses `DataTable`'s
 * existing row-selection props exactly as built for Compliance Records'
 * bulk actions (05 §2) — no new table, no fork.
 *
 * Each row's status is that listing's own pipeline run summarised (see
 * `ecommerce-store.ts`), and its action opens that run: the Processing
 * Pipeline Tracker while it is in flight, the Extraction & Verification
 * page once it has produced a record. One row failing changes nothing
 * about any other row (08 §5's partial-failure requirement).
 */

export interface BatchQueueTableProps {
  listings: readonly ScrapedListing[];
  /** listing id → its pipeline scan id, present once the listing has been submitted. */
  scanIds: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  /** Selection is only offered before the batch is submitted. */
  selectable: boolean;
  labels: {
    caption: string;
    columnThumbnail: string;
    columnTitle: string;
    columnStatus: string;
    columnAction: string;
    selectAll: string;
    selectRow: (title: string) => string;
    statusLabel: (status: ScrapedListing["status"]) => string;
    viewProgress: string;
    viewRecord: string;
    emptyTitle: string;
    emptyBody: string;
  };
}

export function BatchQueueTable({
  listings,
  scanIds,
  selectedIds,
  onToggleRow,
  onToggleAll,
  selectable,
  labels,
}: BatchQueueTableProps) {
  const columns: DataTableColumn<ScrapedListing>[] = [
    {
      key: "listing",
      header: labels.columnThumbnail,
      cellVariant: "image",
      cardHeading: true,
      render: (listing) => (
        <>
          <Image
            src={listing.images[0]?.url ?? "/images/placeholder/ecommerce-listing.svg"}
            alt={listing.images[0]?.altText ?? listing.title}
            width={40}
            height={40}
            className="lmcs-records-thumb-img"
            unoptimized
          />
          <span className="lmcs-records-name ux4g-body-s-default">{listing.title}</span>
        </>
      ),
    },
    {
      key: "status",
      header: labels.columnStatus,
      cellVariant: "tags",
      render: (listing) => (
        <div className="lmcs-batch-status-cell">
          <ListingStatusBadge status={listing.status} label={labels.statusLabel(listing.status)} />
          {listing.status === "failed" && listing.failureReason ? (
            <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {listing.failureReason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "action",
      header: labels.columnAction,
      cardFooter: true,
      render: (listing) => {
        if (listing.status === "done" && listing.recordId) {
          return (
            <Link
              href={ROUTES.extraction(listing.recordId)}
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              aria-label={`${labels.viewRecord}: ${listing.title}`}
            >
              {labels.viewRecord}
            </Link>
          );
        }
        const scanId = scanIds[listing.id];
        if (scanId) {
          return (
            <Link
              href={ROUTES.scanStatus(scanId)}
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              aria-label={`${labels.viewProgress}: ${listing.title}`}
            >
              {labels.viewProgress}
            </Link>
          );
        }
        return null;
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={listings}
      getRowKey={(listing) => listing.id}
      size="m"
      caption={labels.caption}
      selectable={selectable}
      selectedKeys={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      getRowLabel={(listing) => listing.title}
      labels={{ selectAll: labels.selectAll, selectRow: labels.selectRow }}
      emptyState={{
        icon: "search_off",
        title: labels.emptyTitle,
        description: labels.emptyBody,
      }}
    />
  );
}
