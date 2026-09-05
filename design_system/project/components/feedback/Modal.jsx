import * as React from "react";

/* UX4G Modal — dialog on a Backdrop. Surface: Background/Neutral/Elevated,
   radius 8, elevation level 4, header/body/footer stacked with Padding tokens. */
export function Modal({ open = true, title, description, children, primaryAction, secondaryAction, size = "M", status, onClose, closeLabel = "Close", className = "", ...rest }) {
  if (!open) return null;
  const cls = ["ux4g-modal", `ux4g-modal--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <div className="ux4g-backdrop" role="presentation">
      <div className={cls} role="dialog" aria-modal="true" aria-label={title} {...rest}>
        <div className="ux4g-modal__head">
          {status && <span className={"ux4g-icon ux4g-modal__status is-" + status} aria-hidden="true">{status === "error" ? "error" : status === "warning" ? "warning" : status === "success" ? "check_circle" : "info"}</span>}
          <div className="ux4g-modal__titles">
            <h2 className="ux4g-modal__title">{title}</h2>
            {description && <p className="ux4g-modal__desc">{description}</p>}
          </div>
          <button type="button" className="ux4g-field__iconbtn" aria-label={closeLabel} onClick={onClose}>
            <span className="ux4g-icon" aria-hidden="true">close</span>
          </button>
        </div>
        {children && <div className="ux4g-modal__body">{children}</div>}
        {(primaryAction || secondaryAction) && (
          <div className="ux4g-modal__foot">{secondaryAction}{primaryAction}</div>
        )}
      </div>
    </div>
  );
}
