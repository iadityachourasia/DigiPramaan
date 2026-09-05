import * as React from "react";

/* UX4G Focus Ring (source: Border width 1px|2px · Radius Rounded|Sharp|Circular).
   Wraps a child that cannot show its own ring — a custom control, a table row,
   a map region. Prefer the global :focus-visible rule where it applies. */
export function FocusRing({ children, visible = false, width = 2, radius = "rounded", inverse = false, offset = 2, className = "", ...rest }) {
  const cls = ["ux4g-focusring", `ux4g-focusring--${radius}`, inverse ? "is-inverse" : "", visible ? "is-visible" : "", className].filter(Boolean).join(" ");
  return <span className={cls} style={{ "--ux4g-ring-w": width + "px", "--ux4g-ring-o": offset + "px" }} {...rest}>{children}</span>;
}
