import * as React from "react";

/* UX4G Spinner — indeterminate activity. Source axes: Size XS|S|M|L · Type · Tone. */
export function Spinner({ size = "M", tone = "brand", label = "Loading", showLabel = false, className = "", ...rest }) {
  const cls = ["ux4g-spinner", `ux4g-spinner--${size.toLowerCase()}`, `ux4g-spinner--${tone}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} role="status" aria-live="polite" {...rest}>
      <span className="ux4g-spinner__ring" aria-hidden="true" />
      <span className={showLabel ? "ux4g-spinner__label" : "ux4g-sr-only"}>{label}</span>
    </span>
  );
}
