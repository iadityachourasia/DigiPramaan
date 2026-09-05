import * as React from "react";

/* UX4G Table. Source geometry: 8px radius, 1px inset Border/Neutral/Subtle,
   Size M (default) and S row heights, zebra striping None|Rows|Columns.
   Atoms absorbed here: _Table/Header row, _Table/Header cell, _Table/Data row,
   _Table/Cell, _Table/Line. */
export function Table({ columns = [], rows = [], size = "M", zebra = "none", selectable = false, selectedKeys = [], caption, onToggleRow, onToggleAll, emptyState, footer, className = "", ...rest }) {
  const cls = ["ux4g-table", `ux4g-table--${size.toLowerCase()}`, `ux4g-table--zebra-${zebra}`, className].filter(Boolean).join(" ");
  const allOn = rows.length > 0 && selectedKeys.length === rows.length;
  return (
    <div className={cls} {...rest}>
      <table className="ux4g-table__el">
        {caption && <caption className="ux4g-table__caption">{caption}</caption>}
        <thead>
          <tr className="ux4g-table__hrow">
            {selectable && (
              <th className="ux4g-table__hcell ux4g-table__hcell--check" scope="col">
                <input type="checkbox" checked={allOn} onChange={onToggleAll} aria-label="Select all rows" />
              </th>
            )}
            {columns.map(c => (
              <th key={c.key} scope="col" className={"ux4g-table__hcell" + (c.align === "right" ? " is-right" : "")} style={c.width ? { width: c.width } : undefined}>
                <span className="ux4g-table__hcell-inner">
                  {c.label}
                  {c.sortable && <span className="ux4g-icon" aria-hidden="true">{c.sorted === "asc" ? "arrow_upward" : c.sorted === "desc" ? "arrow_downward" : "unfold_more"}</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="ux4g-table__empty" colSpan={columns.length + (selectable ? 1 : 0)}>{emptyState || "No rows"}</td></tr>
          )}
          {rows.map((r, i) => {
            const key = r.key ?? i;
            const on = selectedKeys.includes(key);
            return (
              <tr key={key} className={"ux4g-table__row" + (on ? " is-selected" : "")} tabIndex={0}>
                {selectable && (
                  <td className="ux4g-table__cell ux4g-table__cell--check">
                    <input type="checkbox" checked={on} onChange={() => onToggleRow && onToggleRow(key)} aria-label={"Select " + (r.rowLabel || "row " + (i + 1))} />
                  </td>
                )}
                {columns.map(c => (
                  <td key={c.key} className={"ux4g-table__cell" + (c.align === "right" ? " is-right" : "")}>{r[c.key]}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer && <div className="ux4g-table__foot">{footer}</div>}
    </div>
  );
}
