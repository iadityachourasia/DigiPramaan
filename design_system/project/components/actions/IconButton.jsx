import * as React from "react";

/* UX4G Icon Button — square, icon-only action. Same type/state matrix as Button.
   Sizes 32/40/48/56 to match Button; always needs an accessible label. */
export function IconButton({
  icon = "add",
  ariaLabel,
  size = "M",
  type = "text",
  shape = "rectangle",
  danger = false,
  disabled = false,
  className = "",
  style,
  ...rest
}) {
  const cls = [
    "ux4g-btn",
    "ux4g-iconbtn",
    `ux4g-btn--${size.toLowerCase()}`,
    `ux4g-btn--${type}`,
    shape === "pill" ? "ux4g-btn--pill" : "",
    danger ? "ux4g-btn--danger" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} style={style} disabled={disabled} aria-label={ariaLabel || icon} title={ariaLabel} {...rest}>
      <span className="ux4g-icon ux4g-btn__icon" aria-hidden="true">{icon}</span>
    </button>
  );
}
