import * as React from "react";

/* UX4G Chip — interactive filter/selection token (source: 12 frames).
   Distinct from Tag: a Chip is pressed, a Tag is read. */
export function Chip({ children, label, selected = false, disabled = false, size = "M", icon, avatar, count, onRemove, onClick, className = "", ...rest }) {
  const cls = ["ux4g-chip", `ux4g-chip--${size.toLowerCase()}`, selected ? "is-selected" : "", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} aria-pressed={selected} disabled={disabled} onClick={onClick} {...rest}>
      {avatar && <span className="ux4g-chip__avatar" aria-hidden="true">{avatar}</span>}
      {icon && <span className="ux4g-icon ux4g-chip__icon" aria-hidden="true">{icon}</span>}
      <span className="ux4g-chip__label">{children ?? label}</span>
      {count != null && <span className="ux4g-chip__count">{count}</span>}
      {onRemove && <span className="ux4g-icon ux4g-chip__remove" aria-hidden="true" onClick={e => { e.stopPropagation(); onRemove(); }}>close</span>}
    </button>
  );
}
