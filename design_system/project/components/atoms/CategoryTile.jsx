import * as React from "react";

/* UX4G _Category tile (standalone symbol). Compact browse tile with a count. */
export function CategoryTile({ label, icon = "category", count, href = "#", selected = false, className = "", ...rest }) {
  const cls = ["ux4g-cattile", selected ? "is-selected" : "", className].filter(Boolean).join(" ");
  return (
    <a className={cls} href={href} aria-current={selected ? "true" : undefined} {...rest}>
      <span className="ux4g-icon ux4g-cattile__icon" aria-hidden="true">{icon}</span>
      <span className="ux4g-cattile__label">{label}</span>
      {count != null && <span className="ux4g-cattile__count">{count}</span>}
    </a>
  );
}
