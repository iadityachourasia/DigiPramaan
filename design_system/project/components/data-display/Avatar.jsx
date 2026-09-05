import * as React from "react";

/* UX4G Avatar (source: 29 frames). Sizes XS 20 · S 24 · M 32 · L 40 · XL 48 · XXL 64.
   Falls back initials -> icon; status dot always carries screen-reader text. */
export function Avatar({ name, src, icon = "person", size = "M", shape = "circle", status, statusLabel, className = "", ...rest }) {
  const initials = (name || "").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const cls = ["ux4g-avatar", `ux4g-avatar--${size.toLowerCase()}`, `ux4g-avatar--${shape}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {src
        ? <img className="ux4g-avatar__img" src={src} alt={name || ""} />
        : initials
          ? <span className="ux4g-avatar__initials" aria-hidden="true">{initials}</span>
          : <span className="ux4g-icon ux4g-avatar__icon" aria-hidden="true">{icon}</span>}
      {name && !src && <span className="ux4g-sr-only">{name}</span>}
      {status && (
        <span className={"ux4g-avatar__status is-" + status}>
          <span className="ux4g-sr-only">{statusLabel || status}</span>
        </span>
      )}
    </span>
  );
}
