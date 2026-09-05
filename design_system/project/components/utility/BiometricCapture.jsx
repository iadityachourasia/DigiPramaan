import * as React from "react";

/* UX4G Biometric capture (source: 8 frames + _Biometric status indicator (13 states),
   _Selfie wrapper (7), _Device Check Item, _Device readiness indicator).
   Fingerprint / iris / face capture with device-readiness checks. */
const STATE_COPY = {
  idle: { icon: "fingerprint", text: "Ready to scan", status: "neutral" },
  scanning: { icon: "sensors", text: "Scanning — hold still", status: "info" },
  captured: { icon: "check_circle", text: "Capture complete", status: "success" },
  retry: { icon: "replay", text: "Capture failed — try again", status: "warning" },
  error: { icon: "error", text: "Device not detected", status: "error" },
};
export function BiometricCapture({ mode = "fingerprint", state = "idle", attempt, maxAttempts, deviceChecks = [], instruction, preview, onCapture, captureLabel = "Start capture", className = "", ...rest }) {
  const s = STATE_COPY[state] || STATE_COPY.idle;
  const modeIcon = { fingerprint: "fingerprint", iris: "visibility", face: "face" }[mode] || "fingerprint";
  const cls = ["ux4g-biometric", `ux4g-biometric--${mode}`, `is-${s.status}`, className].filter(Boolean).join(" ");
  return (
    <section className={cls} {...rest}>
      <div className="ux4g-biometric__stage">
        {preview || <span className="ux4g-icon ux4g-biometric__glyph" aria-hidden="true">{modeIcon}</span>}
        {state === "scanning" && <span className="ux4g-biometric__pulse" aria-hidden="true" />}
      </div>
      <p className="ux4g-biometric__status" role="status">
        <span className="ux4g-icon" aria-hidden="true">{s.icon}</span>{s.text}
      </p>
      {instruction && <p className="ux4g-biometric__instruction">{instruction}</p>}
      {attempt != null && maxAttempts != null && (
        <p className="ux4g-biometric__attempts">Attempt {attempt} of {maxAttempts}</p>
      )}
      {deviceChecks.length > 0 && (
        <ul className="ux4g-biometric__checks">
          {deviceChecks.map((c, i) => (
            <li key={i} className={"ux4g-biometric__check is-" + (c.status || "pending")}>
              <span className="ux4g-icon" aria-hidden="true">{c.status === "ok" ? "check_circle" : c.status === "fail" ? "error" : "radio_button_unchecked"}</span>
              {c.label}
              <span className="ux4g-biometric__checkstate">{c.status === "ok" ? "Ready" : c.status === "fail" ? "Not ready" : "Checking"}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ux4g-btn ux4g-btn--filled ux4g-btn--l" onClick={onCapture} disabled={state === "scanning"}>
        <span className="ux4g-btn__label">{captureLabel}</span>
      </button>
    </section>
  );
}
