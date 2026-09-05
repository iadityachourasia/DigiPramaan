import * as React from "react";

/* UX4G Mobile App Header (source: 6 frames) — compact app bar with back or menu,
   title, and up to two trailing actions. */
export function MobileAppHeader({ title, subtitle, leading = "back", onLeading, actions, variant = "light", statusBar = false, className = "", ...rest }) {
  const cls = ["ux4g-appbar", `ux4g-appbar--${variant}`, className].filter(Boolean).join(" ");
  const glyph = leading === "menu" ? "menu" : leading === "close" ? "close" : "arrow_back";
  return (
    <header className={cls} {...rest}>
      {statusBar && <div className="ux4g-appbar__statusbar" aria-hidden="true"><span>9:41</span><span className="ux4g-icon">signal_cellular_alt</span></div>}
      <div className="ux4g-appbar__row">
        {leading !== "none" && (
          <button type="button" className="ux4g-appbar__iconbtn" aria-label={leading === "menu" ? "Open menu" : leading === "close" ? "Close" : "Go back"} onClick={onLeading}>
            <span className="ux4g-icon" aria-hidden="true">{glyph}</span>
          </button>
        )}
        <div className="ux4g-appbar__titles">
          <h1 className="ux4g-appbar__title">{title}</h1>
          {subtitle && <p className="ux4g-appbar__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="ux4g-appbar__actions">{actions}</div>}
      </div>
    </header>
  );
}
