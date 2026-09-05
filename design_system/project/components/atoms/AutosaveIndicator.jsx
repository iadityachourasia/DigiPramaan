import * as React from "react";

/* UX4G _Autosave indicator (source axes: State 2). Tells the user their work is safe. */
export function AutosaveIndicator({ state = "saved", savedAt, className = "", ...rest }) {
  const M = {
    saving: { icon: "sync",         text: "Saving…" },
    saved:  { icon: "cloud_done",   text: savedAt ? "Saved " + savedAt : "All changes saved" },
    error:  { icon: "cloud_off",    text: "Not saved — check your connection" },
  }[state] || {};
  const cls = ["ux4g-autosave", `is-${state}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} role="status" aria-live="polite" {...rest}>
      <span className="ux4g-icon ux4g-autosave__icon" aria-hidden="true">{M.icon}</span>
      {M.text}
    </span>
  );
}
