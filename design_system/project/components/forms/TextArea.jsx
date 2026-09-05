import * as React from "react";

/* UX4G Text Area (Input — Text Field / Text Area variant).
   Min heights from the source _Input field(Text area) set: 80 / 120 / 160. */
export function TextArea({ label, hint, caption, status = "default", rows = 4, minHeight = 120, value, defaultValue, placeholder = "", required = false, disabled = false, maxLength, showCount = false, onChange, id: idProp, className = "", ...rest }) {
  const rid = React.useId();
  const id = idProp || rid;
  const capId = id + "-cap";
  const len = (value ?? defaultValue ?? "").length;
  const cls = ["ux4g-field", "ux4g-field--area", `is-${status}`, disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {label && <label className="ux4g-field__label" htmlFor={id}>{label}{required && <span className="ux4g-field__req" aria-hidden="true"> *</span>}</label>}
      {hint && <span className="ux4g-field__hint">{hint}</span>}
      <div className="ux4g-field__control" style={{ minHeight, alignItems: "flex-start", padding: "8px 12px" }}>
        <textarea id={id} className="ux4g-field__input ux4g-field__textarea" rows={rows} value={value}
          defaultValue={defaultValue} placeholder={placeholder} disabled={disabled} required={required}
          maxLength={maxLength} aria-invalid={status === "error" || undefined}
          aria-describedby={caption ? capId : undefined} onChange={onChange} />
      </div>
      <span className="ux4g-field__footer">
        {caption && <span className="ux4g-field__caption" id={capId}>
          <span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : "info"}</span>{caption}
        </span>}
        {showCount && maxLength && <span className="ux4g-field__count">{len}/{maxLength}</span>}
      </span>
    </div>
  );
}
