import * as React from "react";

/* UX4G _Status indicator (source axes: State 6). Marker + label pair.
   The marker is never alone: WCAG 1.4.1 means the word carries the meaning. */
const MAP = {
  neutral:  { icon: "circle",        label: "Not started" },
  info:     { icon: "info",          label: "In progress" },
  success:  { icon: "check_circle",  label: "Complete" },
  warning:  { icon: "schedule",      label: "Pending" },
  error:    { icon: "error",         label: "Rejected" },
  disabled: { icon: "block",         label: "Not applicable" },
};
export function StatusIndicator({ state = "neutral", label, size = "M", icon, className = "", ...rest }) {
  const m = MAP[state] || MAP.neutral;
  const cls = ["ux4g-status", `ux4g-status--${state}`, `ux4g-status--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      <span className="ux4g-icon ux4g-status__icon" aria-hidden="true">{icon || m.icon}</span>
      <span className="ux4g-status__label">{label || m.label}</span>
    </span>
  );
}
