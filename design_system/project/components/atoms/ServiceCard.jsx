import * as React from "react";

/* UX4G _Service card (standalone symbol). The entry tile for a service on a
   dashboard or landing page. */
export function ServiceCard({ title, description, icon = "apps", href = "#", meta, tag, disabled = false, className = "", ...rest }) {
  const cls = ["ux4g-servicecard", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  const Tag = disabled ? "div" : "a";
  return (
    <Tag className={cls} href={disabled ? undefined : href} aria-disabled={disabled || undefined} {...rest}>
      <span className="ux4g-icon ux4g-servicecard__icon" aria-hidden="true">{icon}</span>
      <span className="ux4g-servicecard__body">
        <span className="ux4g-servicecard__title">{title}</span>
        {description && <span className="ux4g-servicecard__desc">{description}</span>}
        {meta && <span className="ux4g-servicecard__meta">{meta}</span>}
      </span>
      {tag}
      {!disabled && <span className="ux4g-icon ux4g-servicecard__chev" aria-hidden="true">arrow_forward</span>}
    </Tag>
  );
}
