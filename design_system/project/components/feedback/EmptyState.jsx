import * as React from "react";

/* UX4G Empty State — first-run, no-results and error-recovery states.
   Source atoms: _components/empty-image, empty-img-gray, empty-img-simple. */
export function EmptyState({ variant = "default", icon = "inbox", title, description, primaryAction, secondaryAction, size = "M", className = "", ...rest }) {
  const cls = ["ux4g-empty", `ux4g-empty--${variant}`, `ux4g-empty--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <span className="ux4g-empty__art" aria-hidden="true"><span className="ux4g-icon">{icon}</span></span>
      <h3 className="ux4g-empty__title">{title}</h3>
      {description && <p className="ux4g-empty__desc">{description}</p>}
      {(primaryAction || secondaryAction) && <div className="ux4g-empty__actions">{primaryAction}{secondaryAction}</div>}
    </div>
  );
}
