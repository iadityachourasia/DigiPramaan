import * as React from "react";

/* UX4G Backdrop — scrim behind modals, drawers and loading states.
   Uses the Overlay tokens; blur only where the source specifies it. */
export function Backdrop({ open = true, strength = "default", blur = false, children, onClick, className = "", ...rest }) {
  if (!open) return null;
  const cls = ["ux4g-backdrop", `ux4g-backdrop--${strength}`, blur ? "ux4g-backdrop--blur" : "", className].filter(Boolean).join(" ");
  return <div className={cls} role="presentation" onClick={onClick} {...rest}>{children}</div>;
}
