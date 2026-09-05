import Image from "next/image";

import { DataTable, type DataTableColumn, StatusBadge } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { formatShortDate } from "@/lib/utils/format";
import type { ComplianceRecord } from "@/types";

/**
 * RecentScansTable — the 8 most recently scanned products.
 *
 * Built on the new generic `DataTable`. Cap and column set come straight from
 * 02-dashboard.md §2: thumbnail, product name, scan date, status pill, source
 * tag, View action.
 */

export interface RecentScansTableProps {
  records: readonly ComplianceRecord[];
  labels: {
    columnProduct: string;
    columnDate: string;
    columnStatus: string;
    columnSource: string;
    columnAction: string;
    caption: string;
    emptyTitle: string;
    emptyBody: string;
    emptyAction: string;
    errorTitle: string;
    errorBody: string;
    retryLabel: string;
    viewLabel: string;
    /** t(`vocabulary.complianceStatus.${status}`) resolved ahead of time. */
    statusLabels: Record<ComplianceRecord["complianceStatus"], string>;
    sourceLabels: Record<ComplianceRecord["source"], string>;
  };
  locale: string;
  demoState?: "loading" | "empty" | "error";
}

export function RecentScansTable({
  records,
  labels,
  locale,
  demoState,
}: RecentScansTableProps) {
  const columns: DataTableColumn<ComplianceRecord>[] = [
    {
      key: "product",
      header: labels.columnProduct,
      cellVariant: "image",
      cardHeading: true,
      render: (record) => (
        <>
          <Image
            src={record.thumbnail.url}
            alt={record.thumbnail.altText}
            width={40}
            height={40}
            className="lmcs-recent-scans-thumb-img"
            unoptimized
          />
          <span className="lmcs-recent-scans-name ux4g-body-s-default">
            {record.productName}
          </span>
        </>
      ),
    },
    {
      key: "date",
      header: labels.columnDate,
      render: (record) => formatShortDate(record.scannedAt, locale),
    },
    {
      key: "status",
      header: labels.columnStatus,
      cellVariant: "tags",
      render: (record) => (
        <StatusBadge
          status={record.complianceStatus}
          label={labels.statusLabels[record.complianceStatus]}
        />
      ),
    },
    {
      key: "source",
      header: labels.columnSource,
      render: (record) => labels.sourceLabels[record.source],
    },
    {
      key: "action",
      header: labels.columnAction,
      cardFooter: true,
      render: (record) => (
        <Link
          href={ROUTES.recordDetail(record.id)}
          className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
        >
          {labels.viewLabel}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={demoState === "loading" || demoState === "empty" ? [] : records}
      getRowKey={(record) => record.id}
      size="m"
      caption={labels.caption}
      loading={demoState === "loading"}
      emptyState={{
        icon: "document_scanner",
        title: labels.emptyTitle,
        description: labels.emptyBody,
        action: (
          <Link href={ROUTES.scan} className="ux4g-btn ux4g-btn-primary ux4g-btn-sm">
            {labels.emptyAction}
          </Link>
        ),
      }}
      {...(demoState === "error"
        ? {
            error: {
              title: labels.errorTitle,
              description: labels.errorBody,
              action: (
                <Link
                  href={ROUTES.dashboard}
                  className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
                >
                  {labels.retryLabel}
                </Link>
              ),
            },
          }
        : {})}
    />
  );
}
