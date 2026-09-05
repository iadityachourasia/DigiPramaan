import * as React from "react";

/* UX4G _Status banner (source: Status 12). The wide state banner at the head of an
   application or case: what stage it is at, since when, and what happens next. */
const TONE = {
  draft:     { icon: "edit_note",           tone: "neutral" },
  submitted: { icon: "task_alt",            tone: "info" },
  inreview:  { icon: "hourglass_top",       tone: "info" },
  approved:  { icon: "verified",            tone: "success" },
  rejected:  { icon: "cancel",              tone: "error" },
  returned:  { icon: "assignment_return",   tone: "warning" },
  expired:   { icon: "event_busy",          tone: "error" },
  onhold:    { icon: "pause_circle",        tone: "warning" },
};
export function StatusBanner({ status = "submitted", title, detail, since, nextStep, referenceId, actions, className = "", ...rest }) {
  const t = TONE[status] || TONE.submitted;
  const cls = ["ux4g-statusbanner", `ux4g-statusbanner--${t.tone}`, className].filter(Boolean).join(" ");
  return (
    <section className={cls} role="status" {...rest}>
      <span className="ux4g-icon ux4g-statusbanner__icon" aria-hidden="true">{t.icon}</span>
      <div className="ux4g-statusbanner__body">
        <p className="ux4g-statusbanner__title">{title}</p>
        {detail && <p className="ux4g-statusbanner__detail">{detail}</p>}
        <p className="ux4g-statusbanner__meta">
          {referenceId && <span className="ux4g-statusbanner__ref">{referenceId}</span>}
          {since && <span>Since {since}</span>}
          {nextStep && <span><strong>Next:</strong> {nextStep}</span>}
        </p>
      </div>
      {actions && <div className="ux4g-statusbanner__actions">{actions}</div>}
    </section>
  );
}
