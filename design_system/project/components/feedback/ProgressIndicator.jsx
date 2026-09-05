import * as React from "react";

/* UX4G Progress Indicators (source: 14 frames) — linear bar and circular ring,
   determinate and indeterminate, with optional value text. */
export function ProgressIndicator({ type = "linear", value = 0, max = 100, indeterminate = false, size = "M", label, showValue = false, status = "brand", className = "", ...rest }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const cls = ["ux4g-progress", `ux4g-progress--${type}`, `ux4g-progress--${size.toLowerCase()}`, `ux4g-progress--${status}`, indeterminate ? "is-indeterminate" : "", className].filter(Boolean).join(" ");
  const aria = { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": indeterminate ? undefined : value, "aria-label": label };
  if (type === "circular") {
    const r = size === "S" ? 14 : size === "L" ? 28 : 20, c = 2 * Math.PI * r;
    return (
      <div className={cls} {...rest}>
        <svg className="ux4g-progress__ring" width={(r + 4) * 2} height={(r + 4) * 2} {...aria}>
          <circle className="ux4g-progress__ring-track" cx={r + 4} cy={r + 4} r={r} fill="none" strokeWidth="4" />
          <circle className="ux4g-progress__ring-fill" cx={r + 4} cy={r + 4} r={r} fill="none" strokeWidth="4"
            strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round"
            transform={`rotate(-90 ${r + 4} ${r + 4})`} />
        </svg>
        {showValue && <span className="ux4g-progress__value">{Math.round(pct)}%</span>}
      </div>
    );
  }
  return (
    <div className={cls} {...rest}>
      {(label || showValue) && (
        <span className="ux4g-progress__head">
          {label && <span className="ux4g-progress__label">{label}</span>}
          {showValue && <span className="ux4g-progress__value">{Math.round(pct)}%</span>}
        </span>
      )}
      <span className="ux4g-progress__track" {...aria}><span className="ux4g-progress__fill" style={{ width: indeterminate ? undefined : pct + "%" }} /></span>
    </div>
  );
}
