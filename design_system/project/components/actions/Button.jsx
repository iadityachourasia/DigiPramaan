import * as React from "react";

/* UX4G Button. Variant axes from the source component set:
   Size S|M|L|XL · Shape Rectangle|Pill · Type Filled|Outlined|Text|Tonal
   State Default|Hover|Focused|Pressed|Disabled · Loading · Danger.
   Heights 32/40/48/56, radius 8 (rectangle) or 999 (pill), label padded 0 4px inside content. */
export function Button({
  children,
  label,
  size = "M",
  type = "filled",
  shape = "rectangle",
  danger = false,
  loading = false,
  disabled = false,
  fullWidth = false,
  iconLeading,
  iconTrailing,
  className = "",
  style,
  ...rest
}) {
  const cls = [
    "ux4g-btn",
    `ux4g-btn--${size.toLowerCase()}`,
    `ux4g-btn--${type}`,
    shape === "pill" ? "ux4g-btn--pill" : "",
    danger ? "ux4g-btn--danger" : "",
    fullWidth ? "ux4g-btn--full" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} style={style} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="ux4g-btn__spinner" aria-hidden="true" />}
      {!loading && iconLeading && <span className="ux4g-icon ux4g-btn__icon" aria-hidden="true">{iconLeading}</span>}
      <span className="ux4g-btn__label">{children ?? label}</span>
      {iconTrailing && <span className="ux4g-icon ux4g-btn__icon" aria-hidden="true">{iconTrailing}</span>}
    </button>
  );
}
