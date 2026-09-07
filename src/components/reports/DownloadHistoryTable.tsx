"use client";

import { DataTable, type DataTableColumn } from "@/components/shared";
import { reportDownloadHref } from "@/lib/api/reports";
import { formatShortDate } from "@/lib/utils/format";
import type { GeneratedReport } from "@/types";

/**
 * DownloadHistoryTable — previously generated reports (10 §2).
 *
 * The fifth `DataTable` caller, with no selection — nothing here is a bulk
 * action.
 *
 * Re-download is a plain `<a>` per format rather than a button: the download
 * route sets `Content-Disposition`, so the browser saves the file directly
 * and there is no second generation run to wait through. That is what 10 §6's
 * "re-download without regeneration" means from the user's side, even though
 * the file itself is re-rendered server-side from the stored scope.
 */

export interface DownloadHistoryTableProps {
  reports: readonly GeneratedReport[];
  loading: boolean;
  locale: string;
  labels: {
    caption: string;
    columnName: string;
    columnFormats: string;
    columnRows: string;
    columnGeneratedAt: string;
    columnGeneratedBy: string;
    columnReference: string;
    columnActions: string;
    download: (format: string, name: string) => string;
    rowCount: (count: number) => string;
    emptyTitle: string;
    emptyBody: string;
  };
}

export function DownloadHistoryTable({
  reports,
  loading,
  locale,
  labels,
}: DownloadHistoryTableProps) {
  const columns: DataTableColumn<GeneratedReport>[] = [
    {
      key: "name",
      header: labels.columnName,
      cardHeading: true,
      render: (report) => <span className="ux4g-body-s-default">{report.name}</span>,
    },
    {
      key: "formats",
      header: labels.columnFormats,
      cellVariant: "tags",
      render: (report) => (
        <>
          {report.formats.map((format) => (
            <span key={format} className="ux4g-tag-outline-neutral ux4g-tag-s">
              <span className="ux4g-label-s-default">{format}</span>
            </span>
          ))}
        </>
      ),
    },
    {
      key: "rows",
      header: labels.columnRows,
      render: (report) => labels.rowCount(report.rowCount),
    },
    {
      key: "generatedAt",
      header: labels.columnGeneratedAt,
      render: (report) => formatShortDate(report.generatedAt, locale),
    },
    {
      key: "generatedBy",
      header: labels.columnGeneratedBy,
      render: (report) => report.generatedByUserName,
    },
    {
      key: "reference",
      header: labels.columnReference,
      render: (report) => (
        <span className="ux4g-body-s-default">{report.referenceCode}</span>
      ),
    },
    {
      key: "actions",
      header: labels.columnActions,
      cardFooter: true,
      render: (report) => (
        <div className="lmcs-records-row-actions">
          {report.formats.map((format) => (
            <a
              key={format}
              href={reportDownloadHref(report.id, format)}
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              aria-label={labels.download(format, report.name)}
            >
              {format}
            </a>
          ))}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={reports}
      getRowKey={(report) => report.id}
      size="m"
      caption={labels.caption}
      loading={loading}
      emptyState={{
        icon: "summarize",
        title: labels.emptyTitle,
        description: labels.emptyBody,
      }}
    />
  );
}
