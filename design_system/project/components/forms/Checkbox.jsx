import * as React from "react";

/* UX4G Checkbox. Source axes: Type (default|indeterminate|error) · State (6) · Size S|M|L.
   Resting border uses Border/Neutral/Strong — the default control border fails WCAG 1.4.11. */
export function Checkbox({ label, description, checked = false, indeterminate = false, disabled = false, error = false, size = "M", name, value, onChange, className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-check", `ux4g-check--${size.toLowerCase()}`, error ? "is-error" : "", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <input id={id} type="checkbox" className="ux4g-check__input" checked={checked} disabled={disabled}
        name={name} value={value} onChange={onChange}
        aria-checked={indeterminate ? "mixed" : checked} aria-invalid={error || undefined} {...rest} />
      <span className="ux4g-check__box" aria-hidden="true">
        <span className="ux4g-icon">{indeterminate ? "remove" : "check"}</span>
      </span>
      {(label || description) && (
        <span className="ux4g-check__text">
          <label htmlFor={id} className="ux4g-check__label">{label}</label>
          {description && <span className="ux4g-check__desc">{description}</span>}
        </span>
      )}
    </div>
  );
}
