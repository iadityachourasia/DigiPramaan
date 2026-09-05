import * as React from "react";

/* UX4G _Document checklist row (source axes: Size 2 · Tone 5). One required
   document and whether it has been supplied and accepted. */
const TONE = {
  pending:  { icon: "radio_button_unchecked", word: "Not uploaded" },
  uploaded: { icon: "upload_file",            word: "Uploaded" },
  accepted: { icon: "check_circle",           word: "Accepted" },
  rejected: { icon: "error",                  word: "Rejected" },
  optional: { icon: "remove_circle_outline",  word: "Optional" },
};
export function DocumentChecklistRow({ label, hint, tone = "pending", stateLabel, size = "M", required = true, meta, action, className = "", ...rest }) {
  const t = TONE[tone] || TONE.pending;
  const cls = ["ux4g-doccheck", `ux4g-doccheck--${tone}`, `ux4g-doccheck--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <li className={cls} {...rest}>
      <span className="ux4g-icon ux4g-doccheck__icon" aria-hidden="true">{t.icon}</span>
      <div className="ux4g-doccheck__body">
        <p className="ux4g-doccheck__label">
          {label}
          {!required && <span className="ux4g-doccheck__optional"> (optional)</span>}
        </p>
        {hint && <p className="ux4g-doccheck__hint">{hint}</p>}
        {meta && <p className="ux4g-doccheck__meta">{meta}</p>}
      </div>
      <span className="ux4g-doccheck__state">{stateLabel || t.word}</span>
      {action && <span className="ux4g-doccheck__action">{action}</span>}
    </li>
  );
}
