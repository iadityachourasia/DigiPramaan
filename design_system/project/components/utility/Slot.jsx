import * as React from "react";

/* UX4G Slot (source: 7 frames) — the documented placeholder for consumer-supplied
   content inside a component. Renders its children, or a labelled placeholder box
   in specimen mode. */
export function Slot({ children, label = "Slot", minHeight = 40, showPlaceholder, dashed = true, className = "", ...rest }) {
  const empty = children == null || children === false;
  const show = showPlaceholder ?? empty;
  const cls = ["ux4g-slot", dashed ? "is-dashed" : "", show ? "is-placeholder" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={show ? { minHeight } : undefined} {...rest}>
      {show ? <span className="ux4g-slot__label">{label}</span> : children}
    </div>
  );
}
