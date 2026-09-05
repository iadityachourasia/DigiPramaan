import * as React from "react";

/* UX4G Journey timeline (source: 9 frames) — dated audit trail of what happened
   to a record, newest or oldest first. */
export function JourneyTimeline({ events = [], size = "M", className = "", ...rest }) {
  const cls = ["ux4g-timeline", `ux4g-timeline--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <ol className={cls} {...rest}>
      {events.map((e, i) => (
        <li key={i} className={"ux4g-timeline__event is-" + (e.status || "neutral")}>
          <span className="ux4g-timeline__marker" aria-hidden="true"><span className="ux4g-icon">{e.icon || "circle"}</span></span>
          <div className="ux4g-timeline__body">
            <p className="ux4g-timeline__head">
              <span className="ux4g-timeline__title">{e.title}</span>
              <time className="ux4g-timeline__time">{e.time}</time>
            </p>
            {e.actor && <p className="ux4g-timeline__actor">{e.actor}{e.role && <span className="ux4g-timeline__role">{e.role}</span>}</p>}
            {e.detail && <p className="ux4g-timeline__detail">{e.detail}</p>}
            {e.attachments && <div className="ux4g-timeline__attachments">{e.attachments}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
