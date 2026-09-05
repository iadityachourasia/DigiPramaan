import * as React from "react";

/* UX4G Status pipeline (source: 15 frames; _Status pipeline Indicator Size 2 · State 4 ·
   Type 2, plus progress trail). Read-only case progress — unlike Stepper, the user
   does not navigate it. */
export function StatusPipeline({ stages = [], size = "M", orientation = "horizontal", className = "", ...rest }) {
  const cls = ["ux4g-pipeline", `ux4g-pipeline--${size.toLowerCase()}`, `ux4g-pipeline--${orientation}`, className].filter(Boolean).join(" ");
  const glyph = s => s === "complete" ? "check" : s === "current" ? "radio_button_checked" : s === "blocked" ? "block" : "radio_button_unchecked";
  return (
    <ol className={cls} {...rest}>
      {stages.map((s, i) => (
        <li key={i} className={"ux4g-pipeline__stage is-" + (s.state || "pending")} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="ux4g-pipeline__marker" aria-hidden="true"><span className="ux4g-icon">{glyph(s.state)}</span></span>
          <span className="ux4g-pipeline__body">
            <span className="ux4g-pipeline__label">{s.label}</span>
            {s.state && <span className="ux4g-pipeline__state">{s.stateLabel || s.state}</span>}
            {s.meta && <span className="ux4g-pipeline__meta">{s.meta}</span>}
          </span>
          {i < stages.length - 1 && <span className="ux4g-pipeline__trail" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
