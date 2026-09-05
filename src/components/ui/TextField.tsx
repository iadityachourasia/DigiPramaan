"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";

/**
 * TextField — a thin wrapper over the UX4G Input composition.
 *
 * COMPONENT_SPEC.md §2 lists a Form Field component that wraps label, hint, input
 * and error. That component is not in ux4g-web-components@2.0.1. What the package
 * actually ships is the Input composition:
 *
 *   .ux4g-input-container  outer stack, owns the label and helper rows
 *     label.ux4g-label-m-default
 *     .ux4g-input          the bordered box
 *       .ux4g-input-leading-icon
 *       input.ux4g-input-input
 *       .ux4g-input-actions > button.ux4g-input-action-btn
 *     .ux4g-input-helper > .ux4g-input-helper-icon + .ux4g-input-helper-text
 *
 * So this file assembles those classes rather than inventing markup, and exists so
 * the label, hint and error wiring that A-06 and A-07 require is written once
 * instead of on every form. No new class or token appears here.
 */

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "className"> {
  /** Stable id. Used for htmlFor and for the describedby wiring. */
  id: string;
  /** Visible label. Never a placeholder standing in for one (A-06). */
  label: string;
  /** Supporting text shown under the field when there is no error. */
  hint?: string;
  /**
   * Error text. Must name the fix, not just the problem (A-07). Presence of this
   * switches the field into its error state and sets aria-invalid.
   */
  error?: string;
  /** Material icon ligature for the leading slot, e.g. "person". */
  leadingIcon?: string;
  /** Rendered into .ux4g-input-actions. Used for the password reveal toggle. */
  action?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  id,
  label,
  hint,
  error,
  leadingIcon,
  action,
  size = "md",
  ref,
  ...inputProps
}: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  /*
   * Only one of hint or error is described at a time. Pointing at both when an error
   * is showing makes a screen reader read stale guidance after the correction.
   */
  const describedBy = error ? errorId : hint ? hintId : undefined;

  /*
   * The state class belongs on the CONTAINER, not on the bordered box.
   *
   * The package hides helper and error text unconditionally:
   *   .ux4g-input-helper { display: none !important }
   * and re-shows it only through a descendant selector rooted on the container:
   *   .ux4g-input-default .ux4g-input-helper,
   *   .ux4g-input-error   .ux4g-input-helper { display: flex !important }
   *
   * The helper is a sibling of the bordered box, so with the state class on the
   * box it is not a descendant and the rule never matches. That silently hid
   * every hint AND every validation error — the field went red with no message
   * explaining what to fix, which defeats A-07.
   */
  const stateClass = error ? "ux4g-input-error" : "ux4g-input-default";

  return (
    <div className={`ux4g-input-container ux4g-input-${size} ${stateClass}`}>
      <label className="ux4g-label-m-default" htmlFor={id}>
        {label}
      </label>

      <div className={`ux4g-input${error ? " ux4g-input-error" : ""}`}>
        {leadingIcon ? (
          <span className="ux4g-icon-outlined ux4g-input-leading-icon" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}

        <input
          {...inputProps}
          id={id}
          ref={ref}
          className="ux4g-input-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />

        {action ? <div className="ux4g-input-actions">{action}</div> : null}
      </div>

      {error ? (
        /*
         * role="alert" so the message is announced when it appears, which is what
         * ACCESSIBILITY_AND_QA.md §3 round 3 asks for. The icon is decorative; the
         * text carries the meaning, so nothing here depends on colour alone (A-10).
         */
        <div className="ux4g-input-helper" id={errorId} role="alert">
          <span className="ux4g-icon-outlined ux4g-input-helper-icon" aria-hidden="true">
            error
          </span>
          <span className="ux4g-input-helper-text">{error}</span>
        </div>
      ) : hint ? (
        <div className="ux4g-input-helper" id={hintId}>
          <span className="ux4g-input-helper-text">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}
