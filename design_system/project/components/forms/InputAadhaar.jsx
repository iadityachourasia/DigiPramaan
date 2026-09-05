import * as React from "react";

/* UX4G Input — Aadhaar. 12 digits in 4-4-4 groups, optional masking of the first 8,
   with the verification affordance the source shows in the trailing slot. */
export function InputAadhaar({ label = "Aadhaar number", value = "", status = "default", caption, masked = false, verified = false, required = true, disabled = false, onChange, className = "", ...rest }) {
  const id = React.useId();
  const digits = String(value).replace(/\D/g, "").slice(0, 12);
  const shown = (masked ? "XXXXXXXX" + digits.slice(8) : digits).replace(/(.{4})/g, "$1 ").trim();
  const cls = ["ux4g-field", "ux4g-field--m", `is-${status}`, disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <label className="ux4g-field__label" htmlFor={id}>{label}{required && <span className="ux4g-field__req" aria-hidden="true"> *</span>}</label>
      <span className="ux4g-field__hint">12 digits, as printed on the Aadhaar card</span>
      <div className="ux4g-field__control">
        <input id={id} className="ux4g-field__input ux4g-mono" inputMode="numeric" autoComplete="off"
          placeholder="XXXX XXXX XXXX" value={shown} disabled={disabled}
          aria-invalid={status === "error" || undefined} onChange={onChange} />
        {verified && <span className="ux4g-field__verified"><span className="ux4g-icon" aria-hidden="true">verified</span>Verified</span>}
      </div>
      {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : status === "success" ? "check_circle" : "info"}</span>{caption}</span>}
    </div>
  );
}
