import * as React from "react";

/* UX4G Card. Surface = Background/Neutral/Elevated (the only token that layers
   correctly in dark mode), radius 8, 1px subtle border, interior padding from the
   Padding axis. Elevation stays flat unless the card genuinely floats. */
export function Card({ title, subtitle, media, icon, children, actions, footer, elevation = 0, interactive = false, padding = "m", href, className = "", ...rest }) {
  const cls = ["ux4g-card", `ux4g-card--pad-${padding}`, `ux4g-elevation-${elevation}`, interactive ? "is-interactive" : "", className].filter(Boolean).join(" ");
  const Tag = href ? "a" : "div";
  return (
    <Tag className={cls} href={href} {...rest}>
      {media && <div className="ux4g-card__media">{media}</div>}
      {(title || icon) && (
        <div className="ux4g-card__head">
          {icon && <span className="ux4g-icon ux4g-card__icon" aria-hidden="true">{icon}</span>}
          <div className="ux4g-card__titles">
            {title && <h3 className="ux4g-card__title">{title}</h3>}
            {subtitle && <p className="ux4g-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ux4g-card__actions">{actions}</div>}
        </div>
      )}
      {children && <div className="ux4g-card__body">{children}</div>}
      {footer && <div className="ux4g-card__foot">{footer}</div>}
    </Tag>
  );
}
