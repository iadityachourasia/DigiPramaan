import * as React from "react";

/* UX4G Popover — anchored panel with a caret (source: _Carot tip, 4 placements). */
export function Popover({ open = true, placement = "bottom", title, children, actions, onClose, className = "", ...rest }) {
  if (!open) return null;
  const cls = ["ux4g-popover", `ux4g-popover--${placement}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="dialog" aria-label={title} {...rest}>
      <span className="ux4g-popover__caret" aria-hidden="true" />
      <div className="ux4g-popover__head">
        {title && <p className="ux4g-popover__title">{title}</p>}
        <button type="button" className="ux4g-field__iconbtn" aria-label="Close" onClick={onClose}><span className="ux4g-icon" aria-hidden="true">close</span></button>
      </div>
      <div className="ux4g-popover__body">{children}</div>
      {actions && <div className="ux4g-popover__actions">{actions}</div>}
    </div>
  );
}
