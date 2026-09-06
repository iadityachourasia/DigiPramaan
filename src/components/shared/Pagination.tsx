/**
 * Pagination — page size control, prev/next, current page indicator
 * (05-compliance-records.md §2). Real `ux4g-pagination`/`-compact` classes
 * confirmed against the compiled stylesheet size the prev/next controls as
 * small icon buttons; the package has no per-page-number button or
 * active-state class at all (confirmed absent), so page numbers are
 * composed from plain `ux4g-btn` buttons — the same "compose around a real
 * gap, don't invent a fake class" discipline used throughout this app
 * (e.g. PipelineTracker's retry button).
 */

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  labels: {
    navLabel: string;
    previous: string;
    next: string;
    pageLabel: (page: number) => string;
  };
}

/** Current page, first, last, and one neighbour either side — "…" fills any gap. */
function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push("…");
    out.push(sorted[i]!);
  }
  return out;
}

export function Pagination({ page, pageSize, totalCount, onPageChange, labels }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav className="ux4g-pagination ux4g-pagination-compact" aria-label={labels.navLabel}>
      <button
        type="button"
        className="ux4g-pagination-prev"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <span className="ux4g-icon-outlined" aria-hidden="true">
          chevron_left
        </span>
        <span className="ux4g-sr-only">{labels.previous}</span>
      </button>

      <div className="ux4g-pagination-dots">
        {pageNumbers(page, totalPages).map((entry, index) =>
          entry === "…" ? (
            <span key={`dots-${index}`} className="ux4g-body-s-default" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`ux4g-btn ux4g-btn-sm ${
                entry === page ? "ux4g-btn-primary" : "ux4g-btn-text-primary"
              }`}
              aria-current={entry === page ? "page" : undefined}
              aria-label={labels.pageLabel(entry)}
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        className="ux4g-pagination-next"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <span className="ux4g-icon-outlined" aria-hidden="true">
          chevron_right
        </span>
        <span className="ux4g-sr-only">{labels.next}</span>
      </button>
    </nav>
  );
}
