/**
 * WizardProgress — the wizard's own top-of-page progress, reusing the real
 * `ux4g-stepper` classes confirmed against the compiled stylesheet (not the
 * design-canvas `Stepper.jsx` reference, whose BEM-style class names
 * — `ux4g-stepper__step` — do not exist in the installed package).
 *
 * Read-only here (no `onStepClick`): the wizard's phases are not independently
 * navigable — Capture requires a mode first, Submit requires Capture or
 * Manual Entry complete — so this shows where the officer is, it does not
 * offer to jump around.
 */

export interface WizardProgressProps {
  activeIndex: number;
  labels: readonly string[];
}

export function WizardProgress({ activeIndex, labels }: WizardProgressProps) {
  return (
    <ol className="ux4g-stepper ux4g-stepper-horizontal ux4g-stepper-s lmcs-wizard-progress">
      {labels.map((label, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li
            key={label}
            className={`ux4g-stepper-step ux4g-stepper-horizontal${
              done ? " ux4g-stepper-done" : !current ? " ux4g-stepper-step-pending" : ""
            }`}
            aria-current={current ? "step" : undefined}
          >
            <div className="ux4g-stepper-head">
              <span className="ux4g-stepper-head-icon" aria-hidden="true">
                {done ? <span className="ux4g-stepper-head-check" /> : index + 1}
              </span>
            </div>
            <span className="ux4g-stepper-label">{label}</span>
            <span className="ux4g-sr-only">
              {done ? "Completed" : current ? "Current step" : "Not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
