import * as React from "react";

/* UX4G Tooltip — short text label on hover/focus. Inverse surface, radius 4, caret. */
export function Tooltip({ label, placement = "top", children, visible = false, className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-tooltip", `ux4g-tooltip--${placement}`, visible ? "is-visible" : "", className].filter(Boolean).join(" ");
  return (
    <span className="ux4g-tooltip__wrap" {...rest}>
      <span className="ux4g-tooltip__trigger" aria-describedby={id} tabIndex={0}>{children}</span>
      <span className={cls} role="tooltip" id={id}>{label}<span className="ux4g-tooltip__caret" aria-hidden="true" /></span>
    </span>
  );
}
