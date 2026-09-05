import * as React from "react";

/* UX4G Divider (source: 11 frames). Orientation Horizontal|Vertical, Dash Yes|No,
   with an optional inline label. */
export function Divider({ orientation = "horizontal", dashed = false, label, spacing = "m", className = "", ...rest }) {
  const cls = ["ux4g-divider", `ux4g-divider--${orientation}`, dashed ? "is-dashed" : "", `ux4g-divider--sp-${spacing}`, label ? "has-label" : "", className].filter(Boolean).join(" ");
  if (label) return <div className={cls} {...rest}><span className="ux4g-divider__label">{label}</span></div>;
  return <hr className={cls} aria-orientation={orientation} {...rest} />;
}
