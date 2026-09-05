import type { ReactNode } from "react";

/**
 * Alert — the UX4G Alert component, assembled once.
 *
 * DESIGN_SYSTEM.md §11 names custom banners as an anti-pattern, so every page-level
 * message in this product goes through here. The web package has no Toast, so a
 * dismissible Alert is also the sanctioned stand-in for one (COMPONENT_SPEC.md §4).
 *
 * Severity is a real choice, not a default. Every variant pairs its status colour
 * with an icon and text, so nothing is signalled by colour alone (A-10 / A-14).
 */

export type AlertSeverity = "info" | "success" | "warning" | "error";

/** Material icon ligature per severity. Text still carries the meaning. */
const SEVERITY_ICON: Record<AlertSeverity, string> = {
  info: "info",
  success: "check_circle",
  warning: "warning",
  error: "error",
};

export interface AlertProps {
  severity: AlertSeverity;
  /** Short heading. Omit for a single-line message. */
  title?: string;
  children: ReactNode;
  /**
   * How assistive technology should announce this.
   *
   * "assertive" interrupts and is right for a failure the user must act on now, such
   * as a rejected sign-in. "polite" waits for a pause and suits confirmations and
   * standing notices. Anything non-urgent gets "polite" so the page does not talk
   * over itself.
   */
  live?: "polite" | "assertive" | "off";
  actions?: ReactNode;
}

export function Alert({
  severity,
  title,
  children,
  live = "polite",
  actions,
}: AlertProps) {
  return (
    <div
      className={`ux4g-alert ux4g-alert-${severity}`}
      role={severity === "error" ? "alert" : "status"}
      aria-live={live === "off" ? undefined : live}
    >
      <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">
        {SEVERITY_ICON[severity]}
      </span>
      <div className="ux4g-alert-content">
        {title ? <span className="ux4g-alert-title">{title}</span> : null}
        <span className="ux4g-alert-message">{children}</span>
      </div>
      {actions ? <div className="ux4g-alert-actions">{actions}</div> : null}
    </div>
  );
}
