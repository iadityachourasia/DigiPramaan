import * as React from "react";

/* UX4G _Password strength indicator (Strength 3) + _Password conformity checklist item
   (State 2). Strength is named in words; every rule states met or unmet in text. */
export function PasswordStrength({ strength = "weak", rules = [], className = "", ...rest }) {
  const idx = { weak: 1, medium: 2, strong: 3 }[strength] || 1;
  const cls = ["ux4g-pwd", `ux4g-pwd--${strength}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <div className="ux4g-pwd__head">
        <span className="ux4g-pwd__bars" aria-hidden="true">
          {[1, 2, 3].map(n => <span key={n} className={"ux4g-pwd__bar" + (n <= idx ? " is-on" : "")} />)}
        </span>
        <span className="ux4g-pwd__label" role="status">Password strength: <strong>{strength}</strong></span>
      </div>
      {rules.length > 0 && (
        <ul className="ux4g-pwd__rules">
          {rules.map((r, i) => (
            <li key={i} className={"ux4g-pwd__rule" + (r.met ? " is-met" : "")}>
              <span className="ux4g-icon" aria-hidden="true">{r.met ? "check_circle" : "radio_button_unchecked"}</span>
              {r.label}
              <span className="ux4g-sr-only">{r.met ? " — met" : " — not yet met"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
