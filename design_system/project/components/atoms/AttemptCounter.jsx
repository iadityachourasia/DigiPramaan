import * as React from "react";

/* UX4G _Attempt counter (source axes: Last attempt 2). Shown beside OTP and
   biometric capture so lockout is never a surprise. */
export function AttemptCounter({ remaining = 3, total, lockoutNote, className = "", ...rest }) {
  const last = remaining === 1;
  const cls = ["ux4g-attempts", last ? "is-last" : "", remaining === 0 ? "is-locked" : "", className].filter(Boolean).join(" ");
  return (
    <p className={cls} role="status" {...rest}>
      <span className="ux4g-icon" aria-hidden="true">{remaining === 0 ? "lock" : last ? "warning" : "info"}</span>
      {remaining === 0
        ? "No attempts left"
        : `${remaining} of ${total ?? remaining} attempt${remaining === 1 ? "" : "s"} left`}
      {(last || remaining === 0) && lockoutNote && <span className="ux4g-attempts__note">{lockoutNote}</span>}
    </p>
  );
}
