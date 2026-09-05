import * as React from "react";

/* UX4G Input — OTP. Source: _OTP box (8 states) + _OTP caption (6 statuses) + attempt counter.
   Boxes are 48x48 at size L / 40x40 at size M, radius 8, gap 8, digit centred 18px semibold. */
export function InputOTP({ label = "One-time password", length = 6, value = "", status = "default", caption, size = "L", masked = false, attemptsLeft, resendIn, onChange, className = "", ...rest }) {
  const chars = String(value).slice(0, length).split("");
  const cls = ["ux4g-otp", `ux4g-otp--${size.toLowerCase()}`, `is-${status}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <span className="ux4g-field__label" id="otp-label">{label}</span>
      <div className="ux4g-otp__boxes" role="group" aria-labelledby="otp-label">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={"ux4g-otp__box" + (chars[i] ? " is-filled" : "") + (i === chars.length ? " is-focus" : "")}>
            {chars[i] ? (masked ? "•" : chars[i]) : ""}
          </span>
        ))}
        <input className="ux4g-sr-only" inputMode="numeric" autoComplete="one-time-code" maxLength={length} value={value} onChange={onChange} aria-labelledby="otp-label" />
      </div>
      {(caption || attemptsLeft != null || resendIn != null) && (
        <span className="ux4g-otp__caption">
          {caption && <><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : status === "success" ? "check_circle" : "info"}</span>{caption}</>}
          {attemptsLeft != null && <span className="ux4g-otp__attempts">{attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left</span>}
          {resendIn != null && <span className="ux4g-otp__resend">Resend in {resendIn}s</span>}
        </span>
      )}
    </div>
  );
}
