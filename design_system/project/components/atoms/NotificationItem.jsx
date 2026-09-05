import * as React from "react";

/* UX4G _Notification Item (source axes: Action 2). One row in the notification
   panel: icon or avatar, message, timestamp, optional inline action. */
export function NotificationItem({ title, message, time, icon = "notifications", avatar, unread = false, status, action, onDismiss, className = "", ...rest }) {
  const cls = ["ux4g-notif", unread ? "is-unread" : "", status ? "is-" + status : "", className].filter(Boolean).join(" ");
  return (
    <li className={cls} {...rest}>
      <span className="ux4g-notif__lead">
        {avatar || <span className="ux4g-icon" aria-hidden="true">{icon}</span>}
      </span>
      <div className="ux4g-notif__body">
        <p className="ux4g-notif__title">
          {title}
          {unread && <><span className="ux4g-notif__dot" aria-hidden="true" /><span className="ux4g-sr-only">Unread</span></>}
        </p>
        {message && <p className="ux4g-notif__message">{message}</p>}
        <p className="ux4g-notif__time"><time>{time}</time></p>
        {action && <div className="ux4g-notif__action">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="ux4g-field__iconbtn" aria-label={"Dismiss: " + title} onClick={onDismiss}>
          <span className="ux4g-icon" aria-hidden="true">close</span>
        </button>
      )}
    </li>
  );
}
