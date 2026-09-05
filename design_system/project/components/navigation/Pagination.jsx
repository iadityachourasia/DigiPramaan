import * as React from "react";

/* UX4G Pagination (source: 9 frames + _Page / _Pagination control / _Open end).
   Pill-style page controls with truncation, optional page-size select and range text. */
export function Pagination({ page = 1, totalPages = 1, totalItems, pageSize, pageSizeOptions, onPageChange, onPageSizeChange, showRange = true, size = "M", className = "", ...rest }) {
  const win = [];
  const push = n => { if (n >= 1 && n <= totalPages && !win.includes(n)) win.push(n); };
  push(1); push(page - 1); push(page); push(page + 1); push(totalPages);
  win.sort((a, b) => a - b);
  const cls = ["ux4g-pager", `ux4g-pager--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  const from = pageSize ? (page - 1) * pageSize + 1 : null;
  const to = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : null;
  return (
    <nav className={cls} aria-label="Pagination" {...rest}>
      {showRange && totalItems != null && (
        <span className="ux4g-pager__range">{from != null ? `${from}–${to} of ${totalItems}` : `${totalItems} records`}</span>
      )}
      {pageSizeOptions && (
        <label className="ux4g-pager__size">
          Rows
          <select value={pageSize} onChange={e => onPageSizeChange && onPageSizeChange(Number(e.target.value))}>
            {pageSizeOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )}
      <ul className="ux4g-pager__list">
        <li>
          <button type="button" className="ux4g-pager__ctrl" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange && onPageChange(page - 1)}>
            <span className="ux4g-icon" aria-hidden="true">chevron_left</span>
          </button>
        </li>
        {win.map((n, i) => (
          <React.Fragment key={n}>
            {i > 0 && win[i] - win[i - 1] > 1 && <li><span className="ux4g-pager__gap" aria-hidden="true">…</span></li>}
            <li>
              <button type="button" className={"ux4g-pager__page" + (n === page ? " is-current" : "")}
                aria-current={n === page ? "page" : undefined} aria-label={"Page " + n}
                onClick={() => onPageChange && onPageChange(n)}>{n}</button>
            </li>
          </React.Fragment>
        ))}
        <li>
          <button type="button" className="ux4g-pager__ctrl" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange && onPageChange(page + 1)}>
            <span className="ux4g-icon" aria-hidden="true">chevron_right</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
