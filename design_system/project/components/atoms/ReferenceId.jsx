import * as React from "react";

/* UX4G _Reference ID (source axes: State 2). The quotable identifier for a record,
   monospaced so digits and letters cannot be misread, with a copy affordance. */
export function ReferenceId({ value, label = "Reference", copied = false, onCopy, size = "M", className = "", ...rest }) {
  const cls = ["ux4g-refid", `ux4g-refid--${size.toLowerCase()}`, copied ? "is-copied" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      <span className="ux4g-refid__label">{label}</span>
      <code className="ux4g-refid__value">{value}</code>
      {onCopy && (
        <button type="button" className="ux4g-refid__copy" onClick={onCopy}
          aria-label={copied ? "Copied " + value : "Copy " + label + " " + value}>
          <span className="ux4g-icon" aria-hidden="true">{copied ? "check" : "content_copy"}</span>
          <span className="ux4g-refid__copytext">{copied ? "Copied" : "Copy"}</span>
        </button>
      )}
    </span>
  );
}
