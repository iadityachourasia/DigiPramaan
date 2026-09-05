import * as React from "react";

/* UX4G Input — Text Field. Source geometry (Size=M): label gap 4, field 40px tall,
   radius 8, padding 0 12, inner gap 4, leading/trailing icon 18px, text 14/20.
   Size L is 48px tall with 16px padding. Resting border: Border/Neutral/Strong. */
export function InputTextField({
  label, hint, caption, status = "default", size = "M", value, defaultValue, placeholder = "",
  prefix, postfix, iconLeading, iconTrailing, required = false, disabled = false, readOnly = false,
  optionalText, onChange, id: idProp, className = "", inputProps = {}, ...rest
}) {
  const rid = React.useId();
  const id = idProp || rid;
  const capId = id + "-cap";
  const cls = ["ux4g-field", `ux4g-field--${size.toLowerCase()}`, `is-${status}`, disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {label && (
        <label className="ux4g-field__label" htmlFor={id}>
          {label}{required && <span className="ux4g-field__req" aria-hidden="true"> *</span>}
          {optionalText && <span className="ux4g-field__optional"> {optionalText}</span>}
        </label>
      )}
      {hint && <span className="ux4g-field__hint">{hint}</span>}
      <div className="ux4g-field__control">
        {iconLeading && <span className="ux4g-icon ux4g-field__icon" aria-hidden="true">{iconLeading}</span>}
        {prefix && <span className="ux4g-field__affix">{prefix}</span>}
        <input id={id} className="ux4g-field__input" value={value} defaultValue={defaultValue}
          placeholder={placeholder} disabled={disabled} readOnly={readOnly} required={required}
          aria-invalid={status === "error" || undefined} aria-describedby={caption ? capId : undefined}
          onChange={onChange} {...inputProps} />
        {postfix && <span className="ux4g-field__affix">{postfix}</span>}
        {iconTrailing && <span className="ux4g-icon ux4g-field__icon" aria-hidden="true">{iconTrailing}</span>}
      </div>
      {caption && (
        <span className="ux4g-field__caption" id={capId}>
          <span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : status === "success" ? "check_circle" : status === "warning" ? "warning" : "info"}</span>
          {caption}
        </span>
      )}
    </div>
  );
}
