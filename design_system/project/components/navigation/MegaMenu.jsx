import * as React from "react";

/* UX4G Mega Menu (source: 8 frames + _mega menu column / _mega menu list) —
   full-width panel of grouped links under a nav item. */
export function MegaMenu({ open = true, columns = [], featured, footerLinks, onClose, className = "", ...rest }) {
  if (!open) return null;
  const cls = ["ux4g-mega", className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="group" aria-label="Section navigation" {...rest}>
      <div className="ux4g-mega__cols">
        {columns.map((c, i) => (
          <div key={i} className="ux4g-mega__col">
            <p className="ux4g-mega__coltitle">{c.title}</p>
            <ul className="ux4g-mega__list">
              {c.links.map((l, j) => (
                <li key={j}>
                  <a className="ux4g-mega__link" href={l.href || "#"}>
                    {l.icon && <span className="ux4g-icon" aria-hidden="true">{l.icon}</span>}
                    <span>
                      <span className="ux4g-mega__linklabel">{l.label}</span>
                      {l.description && <span className="ux4g-mega__linkdesc">{l.description}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {featured && <div className="ux4g-mega__featured">{featured}</div>}
      </div>
      {footerLinks && <div className="ux4g-mega__foot">{footerLinks}</div>}
    </div>
  );
}
