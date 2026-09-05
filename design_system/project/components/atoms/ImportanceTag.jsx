import * as React from "react";

/* UX4G _Importance tag (source axes: Importance 2). Marks a notice or case as
   requiring priority attention. */
export function ImportanceTag({ importance = "normal", label, className = "", ...rest }) {
  const M = {
    high:   { icon: "priority_high", word: "Important" },
    normal: { icon: "label",         word: "Standard" },
  }[importance] || {};
  const cls = ["ux4g-importance", `ux4g-importance--${importance}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      <span className="ux4g-icon" aria-hidden="true">{M.icon}</span>
      {label || M.word}
    </span>
  );
}
