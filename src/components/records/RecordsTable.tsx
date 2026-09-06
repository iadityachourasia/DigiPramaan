import Image from "next/image";

import { DataTable, type DataTableColumn, StatusBadge } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { formatShortDate } from "@/lib/utils/format";
import type { ComplianceRecord } from "@/types";

/**
 * RecordsTable — the Compliance Records list (05-compliance-records.md §2).
 * Reuses `DataTable` exactly, per the spec's own instruction not to fork
 * it — the row-selection extension `DataTable` gained for this page's bulk
 * actions is the one addition, not a new table.
 */

export interface RecordsTableProps {
  records: readonly ComplianceRecord[];
  loading: boolean;
  hasActiveFilters: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  showSelection: boolean;
  canArchive: boolean;
  onArchive: (record: ComplianceRecord) => void;
  onReScan: (record: ComplianceRecord) => void;
  onGenerateReport: (record: ComplianceRecord) => void;
  locale: string;
  labels: {
    columnThumbnail: string;
    columnProduct: string;
    columnManufacturer: string;
    columnScanDate: string;
    columnStatus: string;
    columnViolations: string;
    columnSource: string;
    columnLastUpdated: string;
    columnActions: string;
    caption: string;
    view: string;
    reScan: string;
    generateReport: string;
    archive: string;
    selectAll: string;
    selectRow: (productName: string) => string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    clearFilters: string;
    emptyTitle: string;
    emptyBody: string;
    emptyAction: string;
    statusLabels: Record<ComplianceRecord["complianceStatus"], string>;
    sourceLabels: Record<ComplianceRecord["source"], string>;
  };
  onClearFilters: () => void;
}

export function RecordsTable({
  records,
  loading,
  hasActiveFilters,
  selectedIds,
  onToggleRow,
  onToggleAll,
  showSelection,
  canArchive,
  onArchive,
  onReScan,
  onGenerateReport,
  locale,
  labels,
  onClearFilters,
}: RecordsTableProps) {
  const columns: DataTableColumn<ComplianceRecord>[] = [
    {
      key: "thumbnail",
      header: labels.columnThumbnail,
      cellVariant: "image",
      cardHeading: true,
      render: (record) => (
        <>
          <Image
            src={record.thumbnail.url}
            alt={record.thumbnail.altText}
            width={40}
            height={40}
            className="lmcs-records-thumb-img"
            unoptimized
          />
          <span className="lmcs-records-name ux4g-body-s-default">{record.productName}</span>
        </>
      ),
    },
    {
      key: "manufacturer",
      header: labels.columnManufacturer,
      render: (record) => record.manufacturerName,
    },
    {
      key: "scanDate",
      header: labels.columnScanDate,
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
      key: "violations",
      header: labels.columnViolations,
      render: (record) => record.violations.length,
    },
    {
      key: "source",
      header: labels.columnSource,
      cellVariant: "tags",
      render: (record) => (
        <span className="ux4g-tag-outline-neutral ux4g-tag-s">
          <span className="ux4g-label-s-default">{labels.sourceLabels[record.source]}</span>
        </span>
      ),
    },
    {
      key: "lastUpdated",
      header: labels.columnLastUpdated,
      render: (record) => formatShortDate(record.lastUpdatedAt, locale),
    },
    {
      key: "actions",
      header: labels.columnActions,
      cardFooter: true,
      render: (record) => (
        <div className="lmcs-records-row-actions">
          <Link
            href={ROUTES.recordDetail(record.id)}
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
            aria-label={`${labels.view}: ${record.productName}`}
          >
            {labels.view}
          </Link>
          <button
            type="button"
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
            onClick={() => onReScan(record)}
            aria-label={`${labels.reScan}: ${record.productName}`}
          >
            {labels.reScan}
          </button>
          <button
            type="button"
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
            onClick={() => onGenerateReport(record)}
            aria-label={`${labels.generateReport}: ${record.productName}`}
          >
            {labels.generateReport}
          </button>
          {canArchive ? (
            <button
              type="button"
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              onClick={() => onArchive(record)}
              aria-label={`${labels.archive}: ${record.productName}`}
            >
              {labels.archive}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={records}
      getRowKey={(record) => record.id}
      size="m"
      caption={labels.caption}
      loading={loading}
      selectable={showSelection}
      selectedKeys={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      getRowLabel={(record) => record.productName}
      labels={{ selectAll: labels.selectAll, selectRow: labels.selectRow }}
      emptyState={
        hasActiveFilters
          ? {
              icon: "search_off",
              title: labels.emptyFilteredTitle,
              description: labels.emptyFilteredBody,
              action: (
                <button
                  type="button"
                  className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
                  onClick={onClearFilters}
                >
                  {labels.clearFilters}
                </button>
              ),
            }
          : {
              icon: "document_scanner",
              title: labels.emptyTitle,
              description: labels.emptyBody,
              action: (
                <Link href={ROUTES.scan} className="ux4g-btn ux4g-btn-primary ux4g-btn-sm">
                  {labels.emptyAction}
                </Link>
              ),
            }
      }
    />
  );
}
