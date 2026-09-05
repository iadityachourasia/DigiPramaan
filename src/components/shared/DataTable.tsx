import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";

/**
 * DataTable — a generic wrapper over the real `ux4g-table` markup, plus a
 * card-per-row fallback below the Mobile/Tablet breakpoint.
 *
 * `COMPONENT_SPEC.md` §3's "DataTable with status" recipe and 02-dashboard.md
 * §5 both say to reuse a shared `Table` component. None existed anywhere in
 * this codebase — confirmed against the whole `src/` tree — so this is that
 * component, built generically because Compliance Records and Analytics need
 * the same shape next, not just the Dashboard's Recent Scans list.
 *
 * TWO MARKUPS, ONE DATA SET
 * -------------------------
 * `PAGE_COMPOSITION.md` §5's Dashboard zone table is explicit: a data table on
 * mobile must be "card-per-row, never a horizontally-scrolled dense table."
 * The first version of this component only rendered the real `<table>`
 * wrapped in `.ux4g-table-responsive`, which scrolls horizontally rather than
 * reflowing — confirmed as a real problem by actually looking at a mobile
 * screenshot, where Recent Scans cut off after two columns with no visible
 * affordance that more content existed off-screen.
 *
 * Both the table and a stacked-card layout are rendered into the DOM; CSS
 * media queries show exactly one of them per breakpoint (`.lmcs-datatable-table`
 * visible at ≥1024px — the bottom of the Tablet range — `.lmcs-datatable-cards`
 * below it, matching DESIGN_SYSTEM.md §8's Mobile/Tablet boundary). Both read
 * from the same `columns`/`rows` props, so a caller writes one column set and
 * gets a correct layout at every width, rather than two components that can
 * drift apart.
 *
 * Table markup follows the package's actual composition, verified against the
 * compiled stylesheet: `.ux4g-table-responsive` wraps a real `<table>` with
 * base + size classes (`.ux4g-table`, `.ux4g-table-s`/`-m`/`-lg`), and each
 * `<td>` content wrapper picks the matching UX4G cell class
 * (`.ux4g-table-cell-image` for a thumbnail-plus-text pair, `-text` for plain
 * ellipsis-safe text, `-tags` for a status badge). Row density is one
 * decision applied to the whole table (DESIGN_SYSTEM §10), not per row.
 *
 * Loading, empty and error states are handled here rather than by every
 * caller re-implementing them, since 02-dashboard.md requires all three,
 * independently, per widget.
 */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Renders one cell's content. Receives the row and must return a node. */
  render: (row: T) => ReactNode;
  /** Defaults to "text". Selects the UX4G cell-content class. */
  cellVariant?: "text" | "image" | "tags";
  /**
   * Omit this column's label from the card layout — for a column whose
   * content is already self-explanatory without a "Product:" prefix, e.g. the
   * thumbnail-and-name column that becomes the card's own heading.
   */
  cardHeading?: boolean;
  /**
   * Render this column outside the label/value list, after it — for a
   * closing action like "View", where "View: View" as a labelled row would be
   * redundant with the link's own text.
   */
  cardFooter?: boolean;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  /** Stable row key, e.g. (row) => row.id. */
  getRowKey: (row: T) => string;
  size?: "s" | "m" | "lg";
  loading?: boolean;
  /** Rows to show as skeleton placeholders while loading. */
  skeletonRowCount?: number;
  emptyState?: { icon: string; title: string; description?: string; action?: ReactNode };
  error?: { title: string; description: string; action?: ReactNode };
  caption: string;
}

const CELL_VARIANT_CLASS: Record<
  NonNullable<DataTableColumn<unknown>["cellVariant"]>,
  string
> = {
  text: "ux4g-table-cell-text",
  image: "ux4g-table-cell-image",
  tags: "ux4g-table-cell-tags",
};

/*
 * Typed over `{ key: string }` rather than `DataTableColumn<T>` — a skeleton
 * row only ever needs a column count and stable keys, never the render
 * function, and keeping it generic-free sidesteps a variance error TypeScript
 * raises for `DataTableColumn<T>[]` vs `DataTableColumn<unknown>[]` under
 * `exactOptionalPropertyTypes`.
 */
function TableSkeletonRows({
  columns,
  count,
}: {
  columns: readonly { key: string }[];
  count: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={`skeleton-${i}`}>
          {columns.map((column) => (
            <td key={column.key}>
              <Skeleton height="1.25rem" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  size = "m",
  loading = false,
  skeletonRowCount = 5,
  emptyState,
  error,
  caption,
}: DataTableProps<T>) {
  if (error) {
    return <ErrorState {...error} />;
  }

  if (!loading && rows.length === 0 && emptyState) {
    return <EmptyState {...emptyState} />;
  }

  const headingColumn = columns.find((c) => c.cardHeading);
  const footerColumn = columns.find((c) => c.cardFooter);
  const detailColumns = columns.filter(
    (c) => c !== headingColumn && c !== footerColumn
  );

  return (
    <>
      {/* ─── ≥1024px: the real table ─── */}
      <div className="ux4g-table-responsive lmcs-datatable-table">
        <table className={`ux4g-table ux4g-table-${size}`}>
          <caption className="ux4g-sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeletonRows columns={columns} count={skeletonRowCount} />
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <div
                        className={CELL_VARIANT_CLASS[column.cellVariant ?? "text"]}
                      >
                        {column.render(row)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Below 1024px: one card per row ─── */}
      <div className="lmcs-datatable-cards">
        <span className="ux4g-sr-only">{caption}</span>
        {loading
          ? Array.from({ length: skeletonRowCount }, (_, i) => (
              <div key={`skeleton-${i}`} className="ux4g-card ux4g-card-outline">
                <div className="ux4g-card-body lmcs-datatable-card">
                  <Skeleton height="1.5rem" />
                  <Skeleton height="1rem" width="60%" />
                </div>
              </div>
            ))
          : rows.map((row) => (
              <div key={getRowKey(row)} className="ux4g-card ux4g-card-outline">
                <div className="ux4g-card-body lmcs-datatable-card">
                  {headingColumn ? (
                    <div
                      className={
                        CELL_VARIANT_CLASS[headingColumn.cellVariant ?? "text"]
                      }
                    >
                      {headingColumn.render(row)}
                    </div>
                  ) : null}
                  <dl className="lmcs-datatable-card-details">
                    {detailColumns.map((column) => (
                      <div key={column.key} className="lmcs-datatable-card-row">
                        <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
                          {column.header}
                        </dt>
                        <dd
                          className={
                            CELL_VARIANT_CLASS[column.cellVariant ?? "text"]
                          }
                        >
                          {column.render(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {footerColumn ? (
                    <div className="lmcs-datatable-card-footer">
                      {footerColumn.render(row)}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
      </div>
    </>
  );
}
