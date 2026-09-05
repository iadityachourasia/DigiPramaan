import * as React from "react";

/* UX4G _Info list (source axes: List type 6 · Device 2). Read-only key/value
   record summary — the review step of a form, and case detail panels. */
export function InfoList({ items = [], layout = "rows", size = "M", divided = true, className = "", ...rest }) {
  const cls = ["ux4g-infolist", `ux4g-infolist--${layout}`, `ux4g-infolist--${size.toLowerCase()}`, divided ? "is-divided" : "", className].filter(Boolean).join(" ");
  return (
    <dl className={cls} {...rest}>
      {items.map((it, i) => (
        <div key={i} className="ux4g-infolist__row">
          <dt className="ux4g-infolist__key">{it.label}</dt>
          <dd className="ux4g-infolist__val">
            {it.value}
            {it.hint && <span className="ux4g-infolist__hint">{it.hint}</span>}
          </dd>
          {it.action && <div className="ux4g-infolist__action">{it.action}</div>}
        </div>
      ))}
    </dl>
  );
}
