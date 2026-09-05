import * as React from "react";

/* UX4G NavBar (source: Device Desktop|Mobile · Content · Navigation layout Right|Left ·
   Type). Masthead + primary navigation. This is one of the few places brand-primary
   fill is allowed, as an identity moment. */
export function NavBar({ brand = "UX4G", brandHref = "/", items = [], activeIndex = 0, actions, layout = "right", variant = "light", logo, className = "", ...rest }) {
  const cls = ["ux4g-navbar", `ux4g-navbar--${variant}`, `ux4g-navbar--${layout}`, className].filter(Boolean).join(" ");
  return (
    <header className={cls} {...rest}>
      <a className="ux4g-navbar__brand" href={brandHref}>
        {logo || <span className="ux4g-navbar__wordmark">{brand}</span>}
      </a>
      <nav className="ux4g-navbar__nav" aria-label="Primary">
        <ul className="ux4g-navbar__list">
          {items.map((it, i) => (
            <li key={i} className="ux4g-navbar__item">
              <a className={"ux4g-navbar__link" + (i === activeIndex ? " is-active" : "")} href={it.href || "#"}
                aria-current={i === activeIndex ? "page" : undefined}>
                {it.icon && <span className="ux4g-icon" aria-hidden="true">{it.icon}</span>}
                {it.label}
                {it.dropdown && <span className="ux4g-icon" aria-hidden="true">arrow_drop_down</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {actions && <div className="ux4g-navbar__actions">{actions}</div>}
    </header>
  );
}
