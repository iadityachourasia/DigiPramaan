import * as React from "react";

/* UX4G Thumbnail — small fixed-ratio preview for a product scan or document,
   with the source's file-type fallback glyph. */
export function Thumbnail({ src, alt = "", size = "M", ratio = "1", icon = "image", badge, className = "", ...rest }) {
  const cls = ["ux4g-thumb", `ux4g-thumb--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} style={{ aspectRatio: ratio }} {...rest}>
      {src ? <img className="ux4g-thumb__img" src={src} alt={alt} /> : <span className="ux4g-icon ux4g-thumb__icon" aria-hidden="true">{icon}</span>}
      {badge && <span className="ux4g-thumb__badge">{badge}</span>}
    </span>
  );
}
