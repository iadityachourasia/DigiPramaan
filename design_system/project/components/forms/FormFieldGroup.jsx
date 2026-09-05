import * as React from "react";

/* UX4G Form Field Group — a labelled fieldset that binds related controls together.
   Vertical rhythm uses Stack tokens; the group heading is a real <legend>. */
export function FormFieldGroup({ legend, description, caption, status = "default", required = false, layout = "stack", children, className = "", ...rest }) {
  const cls = ["ux4g-group", `ux4g-group--${layout}`, `is-${status}`, className].filter(Boolean).join(" ");
  return (
    <fieldset className={cls} {...rest}>
      {legend && <legend className="ux4g-group__legend">{legend}{required && <span className="ux4g-field__req" aria-hidden="true"> *</span>}</legend>}
      {description && <p className="ux4g-group__desc">{description}</p>}
      <div className="ux4g-group__body">{children}</div>
      {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : "info"}</span>{caption}</span>}
    </fieldset>
  );
}
