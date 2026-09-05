import * as React from "react";

/* UX4G Link (source: 8 frames). Underlined by default; Text/Link/* tokens for
   default, hover, active and disabled. External links announce themselves. */
export function Link({ children, href = "#", size = "M", external = false, icon, iconPosition = "end", inverse = false, disabled = false, className = "", ...rest }) {
  const cls = ["ux4g-link", `ux4g-link--${size.toLowerCase()}`, inverse ? "ux4g-link--inverse" : "", className].filter(Boolean).join(" ");
  const glyph = icon || (external ? "open_in_new" : null);
  return (
    <a className={cls} href={disabled ? undefined : href} aria-disabled={disabled || undefined}
      target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} {...rest}>
      {glyph && iconPosition === "start" && <span className="ux4g-icon ux4g-link__icon" aria-hidden="true">{glyph}</span>}
      {children}
      {glyph && iconPosition === "end" && <span className="ux4g-icon ux4g-link__icon" aria-hidden="true">{glyph}</span>}
      {external && <span className="ux4g-sr-only"> (opens in a new tab)</span>}
    </a>
  );
}
