import * as React from "react";
const STATUS_ICON = { info: "info", success: "check_circle", warning: "warning", error: "error", neutral: "campaign" };

/* UX4G System Alert — full-width service-level banner, above the header or masthead. */
export function SystemAlert({ status = "info", title, message, linkLabel, linkHref = "#", dismissible = true, onDismiss, className = "", ...rest }) {
  const cls = ["ux4g-sysalert", `ux4g-sysalert--${status}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} role={status === "error" ? "alert" : "status"} {...rest}>
      <span className="ux4g-icon ux4g-sysalert__icon" aria-hidden="true">{STATUS_ICON[status]}</span>
      <span className="ux4g-sysalert__body">
        {title && <strong className="ux4g-sysalert__title">{title}</strong>}
        {message && <span className="ux4g-sysalert__text">{message}</span>}
        {linkLabel && <a className="ux4g-sysalert__link" href={linkHref}>{linkLabel}</a>}
      </span>
      {dismissible && (
        <button type="button" className="ux4g-field__iconbtn" aria-label="Dismiss announcement" onClick={onDismiss}>
          <span className="ux4g-icon" aria-hidden="true">close</span>
        </button>
      )}
    </div>
  );
}
