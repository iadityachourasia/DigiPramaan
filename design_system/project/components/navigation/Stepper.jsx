import * as React from "react";

/* UX4G Stepper (source: _Stepper Indicator — Size 2 · Border 2 · Type 3 · Status 2 ·
   Filled 2, plus indicator+trail items and progress trail). Navigable multi-step
   progress — unlike StatusPipeline, the user moves through it. */
export function Stepper({ steps = [], activeIndex = 0, orientation = "horizontal", size = "M", labelLayout = "below", onStepClick, className = "", ...rest }) {
  const cls = ["ux4g-stepper", `ux4g-stepper--${orientation}`, `ux4g-stepper--${size.toLowerCase()}`, `ux4g-stepper--label-${labelLayout}`, className].filter(Boolean).join(" ");
  return (
    <ol className={cls} {...rest}>
      {steps.map((s, i) => {
        const state = s.state || (i < activeIndex ? "complete" : i === activeIndex ? "current" : "upcoming");
        const clickable = onStepClick && state !== "upcoming";
        const Inner = clickable ? "button" : "span";
        return (
          <li key={i} className={"ux4g-stepper__step is-" + state} aria-current={state === "current" ? "step" : undefined}>
            <Inner className="ux4g-stepper__hit" type={clickable ? "button" : undefined} onClick={clickable ? () => onStepClick(i) : undefined}>
              <span className="ux4g-stepper__indicator" aria-hidden="true">
                {state === "complete" ? <span className="ux4g-icon">check</span> : state === "error" ? <span className="ux4g-icon">error</span> : i + 1}
              </span>
              <span className="ux4g-stepper__body">
                <span className="ux4g-stepper__label">{s.label}</span>
                {s.supporting && <span className="ux4g-stepper__supporting">{s.supporting}</span>}
                <span className="ux4g-sr-only">{state === "complete" ? "Completed" : state === "current" ? "Current step" : state === "error" ? "Needs attention" : "Not started"}</span>
              </span>
            </Inner>
            {i < steps.length - 1 && <span className="ux4g-stepper__trail" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
