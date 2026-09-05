import * as React from "react";

/* UX4G Draft status banner — sticky strip telling the user where an unfinished
   application stands. Source axes: Status (12) + autosave indicator + reference ID. */
export function DraftStatusBanner({ status = "draft", title = "Draft saved", referenceId, savedAt, autosaving = false, actions, className = "", ...rest }) {
  const icon = { draft: "edit_note", submitted: "task_alt", returned: "assignment_return", expiring: "schedule", locked: "lock" }[status] || "edit_note";
  const cls = ["ux4g-draft", `ux4g-draft--${status}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="status" {...rest}>
      <span className="ux4g-icon ux4g-draft__icon" aria-hidden="true">{icon}</span>
      <span className="ux4g-draft__body">
        <strong className="ux4g-draft__title">{title}</strong>
        {referenceId && <span className="ux4g-draft__ref">Reference {referenceId}</span>}
        {savedAt && <span className="ux4g-draft__meta">{autosaving ? "Saving…" : "Last saved " + savedAt}</span>}
      </span>
      {actions && <span className="ux4g-draft__actions">{actions}</span>}
    </div>
  );
}
