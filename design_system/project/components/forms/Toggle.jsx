import * as React from "react";

/* UX4G Toggle. Track/thumb colours come from the Control/* token tier;
   the track border uses Border/Neutral/Strong so the off state stays visible. */
export function Toggle({ label, description, checked = false, disabled = false, size = "M", onChange, labelPosition = "end", className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-toggle", `ux4g-toggle--${size.toLowerCase()}`, labelPosition === "start" ? "ux4g-toggle--label-start" : "", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <input id={id} type="checkbox" role="switch" className="ux4g-toggle__input" checked={checked} disabled={disabled} onChange={onChange} {...rest} />
      <span className="ux4g-toggle__track" aria-hidden="true"><span className="ux4g-toggle__thumb" /></span>
      {(label || description) && (
        <span className="ux4g-toggle__text">
          <label htmlFor={id} className="ux4g-toggle__label">{label}</label>
          {description && <span className="ux4g-toggle__desc">{description}</span>}
        </span>
      )}
    </div>
  );
}
