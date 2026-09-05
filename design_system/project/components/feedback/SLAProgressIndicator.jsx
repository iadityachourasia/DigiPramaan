import * as React from "react";

/* UX4G SLA Progress Indicator (source: 21 frames, _SLA item Type 1-4).
   Shows elapsed time against a service commitment, with a breach state. */
export function SLAProgressIndicator({ label = "Service commitment", elapsed = 0, total = 100, unit = "days", status, dueLabel, breached = false, size = "M", className = "", ...rest }) {
  const pct = Math.min(100, Math.round((elapsed / total) * 100));
  const derived = status || (breached ? "error" : pct >= 80 ? "warning" : "success");
  const cls = ["ux4g-sla", `ux4g-sla--${derived}`, `ux4g-sla--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <span className="ux4g-sla__head">
        <span className="ux4g-sla__label">{label}</span>
        <span className="ux4g-sla__state">
          <span className="ux4g-icon" aria-hidden="true">{derived === "error" ? "error" : derived === "warning" ? "schedule" : "check_circle"}</span>
          {breached ? "SLA breached" : dueLabel || `${total - elapsed} ${unit} left`}
        </span>
      </span>
      <span className="ux4g-sla__track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={elapsed} aria-label={label}>
        <span className="ux4g-sla__fill" style={{ width: pct + "%" }} />
      </span>
      <span className="ux4g-sla__meta">{elapsed} of {total} {unit} used</span>
    </div>
  );
}
