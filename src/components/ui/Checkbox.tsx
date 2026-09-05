"use client";

import type { InputHTMLAttributes, Ref } from "react";

/**
 * Checkbox — the UX4G checkbox composition, assembled once.
 *
 * Package structure, confirmed from the compiled CSS:
 *
 *   label.ux4g-checkbox.ux4g-checkbox-md
 *     input.ux4g-checkbox-input   visually hidden, carries the real state
 *     span.ux4g-checkbox-control > span.ux4g-checkmark
 *     span.ux4g-checkbox-content > span.ux4g-checkbox-header > span.ux4g-checkbox-label
 *
 * The input stays a real checkbox rather than a div with a role, so keyboard
 * behaviour, form participation and screen-reader state come for free.
 *
 * .ux4g-checkbox sets pointer-events: none on itself and re-enables them on the
 * control, so the label text is not clickable by default. Wrapping everything in a
 * <label> restores the click-the-text behaviour people expect without fighting the
 * package's own rules.
 */

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "className" | "type"> {
  id: string;
  label: string;
  size?: "sm" | "md" | "lg";
  ref?: Ref<HTMLInputElement>;
}

export function Checkbox({
  id,
  label,
  size = "md",
  ref,
  ...inputProps
}: CheckboxProps) {
  return (
    <label className={`ux4g-checkbox ux4g-checkbox-${size}`} htmlFor={id}>
      <input
        {...inputProps}
        type="checkbox"
        id={id}
        ref={ref}
        className="ux4g-checkbox-input"
      />
      <span className="ux4g-checkbox-control" aria-hidden="true">
        <span className="ux4g-checkmark" />
      </span>
      <span className="ux4g-checkbox-content">
        <span className="ux4g-checkbox-header">
          <span className="ux4g-checkbox-label">{label}</span>
        </span>
      </span>
    </label>
  );
}
