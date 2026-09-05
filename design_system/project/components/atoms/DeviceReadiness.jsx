import * as React from "react";

/* UX4G _Device readiness indicator (All complete 2 · Mode 2) with _Device Check Item
   (Status 3). Pre-flight checks before a biometric or scan capture. */
export function DeviceReadiness({ checks = [], title = "Device checks", mode = "list", className = "", ...rest }) {
  const done = checks.filter(c => c.status === "ok").length;
  const allDone = checks.length > 0 && done === checks.length;
  const failed = checks.some(c => c.status === "fail");
  const cls = ["ux4g-devready", `ux4g-devready--${mode}`, allDone ? "is-complete" : failed ? "is-failed" : "", className].filter(Boolean).join(" ");
  return (
    <section className={cls} {...rest}>
      <p className="ux4g-devready__head" role="status">
        <span className="ux4g-icon" aria-hidden="true">{allDone ? "check_circle" : failed ? "error" : "pending"}</span>
        {title}
        <span className="ux4g-devready__count">{done} of {checks.length} ready</span>
      </p>
      <ul className="ux4g-devready__list">
        {checks.map((c, i) => (
          <li key={i} className={"ux4g-devready__item is-" + (c.status || "pending")}>
            <span className="ux4g-icon" aria-hidden="true">{c.status === "ok" ? "check_circle" : c.status === "fail" ? "cancel" : "radio_button_unchecked"}</span>
            <span className="ux4g-devready__label">{c.label}</span>
            <span className="ux4g-devready__state">{c.status === "ok" ? "Ready" : c.status === "fail" ? c.note || "Not ready" : "Checking…"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
