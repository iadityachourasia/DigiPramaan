import * as React from "react";

/* UX4G Badge — count or dot marker attached to an icon or avatar.
   Source axes: Type (dot|count) · Colour (neutral|brand|success|warning|error|info) · Border. */
export function Badge({ count, max = 99, type = "count", color = "error", showZero = false, withBorder = true, srLabel, children, className = "", ...rest }) {
  const visible = type === "dot" || showZero || (count != null && count > 0);
  const text = count != null && count > max ? max + "+" : String(count ?? "");
  const cls = ["ux4g-badge", `ux4g-badge--${type}`, `ux4g-badge--${color}`, withBorder ? "ux4g-badge--bordered" : "", className].filter(Boolean).join(" ");
  return (
    <span className="ux4g-badge__anchor" {...rest}>
      {children}
      {visible && <span className={cls}>{type === "count" && text}<span className="ux4g-sr-only">{srLabel || (type === "count" ? text + " new" : "New")}</span></span>}
    </span>
  );
}
