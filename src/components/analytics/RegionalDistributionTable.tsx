import { DataTable, type DataTableColumn } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { RegionBreakdownEntry } from "@/types";

/**
 * RegionalDistributionTable — Regional Distribution
 * (07-analytics-violation-trends.md §2): "deliberately not a GIS map for
 * MVP." Reuses `DataTable` (the same shared component Compliance Records'
 * own table is built on) rather than a fifth chart type — the Claude
 * Design Prompt names "sortable table" first in its own "table or
 * horizontal bar chart" either/or.
 */

export interface RegionalDistributionTableProps {
  data: readonly RegionBreakdownEntry[];
  labels: {
    caption: string;
    columnRegion: string;
    columnTotalScanned: string;
    columnNonCompliant: string;
    columnRate: string;
    columnAction: string;
    view: string;
  };
}

export function RegionalDistributionTable({ data, labels }: RegionalDistributionTableProps) {
  const columns: DataTableColumn<RegionBreakdownEntry>[] = [
    { key: "region", header: labels.columnRegion, cardHeading: true, render: (row) => row.region },
    {
      key: "totalScanned",
      header: labels.columnTotalScanned,
      render: (row) => row.totalScanned,
    },
    {
      key: "nonCompliant",
      header: labels.columnNonCompliant,
      render: (row) => row.nonCompliant,
    },
    {
      key: "rate",
      header: labels.columnRate,
      render: (row) =>
        row.totalScanned === 0
          ? "—"
          : `${Math.round((row.nonCompliant / row.totalScanned) * 100)}%`,
    },
    {
      key: "action",
      header: labels.columnAction,
      cardFooter: true,
      render: (row) => (
        <Link
          href={`${ROUTES.records}?regions=${encodeURIComponent(row.region)}`}
          className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
          aria-label={`${labels.view}: ${row.region}`}
        >
          {labels.view}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={data}
      getRowKey={(row) => row.region}
      size="m"
      caption={labels.caption}
    />
  );
}
