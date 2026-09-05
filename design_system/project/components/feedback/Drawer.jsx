import * as React from "react";

/* UX4G Drawer — side sheet (source: 20 frames; left|right|bottom, S|M|L widths). */
export function Drawer({ open = true, side = "right", size = "M", title, description, children, footer, onClose, className = "", ...rest }) {
  if (!open) return null;
  const cls = ["ux4g-drawer", `ux4g-drawer--${side}`, `ux4g-drawer--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <div className="ux4g-backdrop" role="presentation">
      <aside className={cls} role="dialog" aria-modal="true" aria-label={title} {...rest}>
        <header className="ux4g-drawer__head">
          <div className="ux4g-drawer__titles">
            <h2 className="ux4g-drawer__title">{title}</h2>
            {description && <p className="ux4g-drawer__desc">{description}</p>}
          </div>
          <button type="button" className="ux4g-field__iconbtn" aria-label="Close panel" onClick={onClose}>
            <span className="ux4g-icon" aria-hidden="true">close</span>
          </button>
        </header>
        <div className="ux4g-drawer__body">{children}</div>
        {footer && <footer className="ux4g-drawer__foot">{footer}</footer>}
      </aside>
    </div>
  );
}
