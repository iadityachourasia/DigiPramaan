import * as React from "react";
const STATUS_ICON = { info: "info", success: "check_circle", warning: "warning", error: "error", neutral: "campaign" };

/* UX4G Context Alert — inline message tied to the section it appears in.
   Status is icon + label + token, never colour alone. */
export function ContextAlert({ status = "info", title, children, actions, dismissible = false, onDismiss, compact = false, className = "", ...rest }) {
  const cls = ["ux4g-alert", `ux4g-alert--${status}`, compact ? "ux4g-alert--compact" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} role={status === "error" ? "alert" : "status"} {...rest}>
      <span className="ux4g-icon ux4g-alert__icon" aria-hidden="true">{STATUS_ICON[status]}</span>
      <div className="ux4g-alert__body">
        {title && <p className="ux4g-alert__title">{title}</p>}
        {children && <div className="ux4g-alert__text">{children}</div>}
        {actions && <div className="ux4g-alert__actions">{actions}</div>}
      </div>
      {dismissible && (
        <button type="button" className="ux4g-field__iconbtn" aria-label="Dismiss message" onClick={onDismiss}>
          <span className="ux4g-icon" aria-hidden="true">close</span>
        </button>
      )}
    </div>
  );
}
