import * as React from "react";

/* UX4G Radio Button. Source axes: On/Off · Size S|M|L · State (6). */
export function RadioButton({ label, description, checked = false, disabled = false, error = false, size = "M", name, value, onChange, className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-radio", `ux4g-radio--${size.toLowerCase()}`, error ? "is-error" : "", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <input id={id} type="radio" className="ux4g-radio__input" checked={checked} disabled={disabled}
        name={name} value={value} onChange={onChange} aria-invalid={error || undefined} {...rest} />
      <span className="ux4g-radio__dot" aria-hidden="true" />
      {(label || description) && (
        <span className="ux4g-radio__text">
          <label htmlFor={id} className="ux4g-radio__label">{label}</label>
          {description && <span className="ux4g-radio__desc">{description}</span>}
        </span>
      )}
    </div>
  );
}
