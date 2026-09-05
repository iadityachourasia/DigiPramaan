import * as React from "react";

/* UX4G Breadcrumb (source: 8 frames; forward-slash divider is the file's default). */
export function Breadcrumb({ items = [], divider = "chevron", maxVisible, className = "", ...rest }) {
  let shown = items;
  let collapsed = false;
  if (maxVisible && items.length > maxVisible) { shown = [items[0], ...items.slice(-(maxVisible - 1))]; collapsed = true; }
  const sep = divider === "slash" ? "/" : null;
  const cls = ["ux4g-crumbs", className].filter(Boolean).join(" ");
  return (
    <nav className={cls} aria-label="Breadcrumb" {...rest}>
      <ol className="ux4g-crumbs__list">
        {shown.map((it, i) => {
          const last = i === shown.length - 1;
          return (
            <li key={i} className="ux4g-crumbs__item">
              {i === 1 && collapsed && (
                <><span className="ux4g-crumbs__sep" aria-hidden="true">{sep || <span className="ux4g-icon">chevron_right</span>}</span><span className="ux4g-crumbs__ellipsis">…</span></>
              )}
              {i > 0 && <span className="ux4g-crumbs__sep" aria-hidden="true">{sep || <span className="ux4g-icon">chevron_right</span>}</span>}
              {last
                ? <span className="ux4g-crumbs__current" aria-current="page">{it.label}</span>
                : <a className="ux4g-crumbs__link" href={it.href || "#"}>{it.icon && <span className="ux4g-icon" aria-hidden="true">{it.icon}</span>}{it.label}</a>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
