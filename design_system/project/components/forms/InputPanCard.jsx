import * as React from "react";

/* UX4G Input — PAN Card. 10 characters, AAAAA9999A, upper-cased on entry. */
export function InputPanCard({ label = "PAN", value = "", status = "default", caption, verified = false, required = true, disabled = false, onChange, className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-field", "ux4g-field--m", `is-${status}`, disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <label className="ux4g-field__label" htmlFor={id}>{label}{required && <span className="ux4g-field__req" aria-hidden="true"> *</span>}</label>
      <span className="ux4g-field__hint">Ten characters in the format AAAAA9999A</span>
      <div className="ux4g-field__control">
        <input id={id} className="ux4g-field__input ux4g-mono" maxLength={10} autoComplete="off"
          placeholder="ABCDE1234F" value={String(value).toUpperCase()} disabled={disabled}
          style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
          aria-invalid={status === "error" || undefined} onChange={onChange} />
        {verified && <span className="ux4g-field__verified"><span className="ux4g-icon" aria-hidden="true">verified</span>Verified</span>}
      </div>
      {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : status === "success" ? "check_circle" : "info"}</span>{caption}</span>}
    </div>
  );
}
