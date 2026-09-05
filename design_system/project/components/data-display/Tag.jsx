import * as React from "react";

/* UX4G Tag. Source axes: Size S|M · Colour Neutral|Brand|Success|Warning|Error|Info ·
   Type Tonal|Filled|Outline|Text · Shape Rectangular|Circular.
   Size M geometry: height 24, radius 4, padding 4px 8px 5px, gap 4, icon 16, label 12/500. */
export function Tag({ children, label, size = "M", color = "neutral", type = "tonal", shape = "rectangular", icon, onRemove, removeLabel, className = "", ...rest }) {
  const cls = ["ux4g-tag", `ux4g-tag--${size.toLowerCase()}`, `ux4g-tag--${color}`, `ux4g-tag--${type}`, shape === "circular" ? "ux4g-tag--circular" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {icon && <span className="ux4g-icon ux4g-tag__icon" aria-hidden="true">{icon}</span>}
      <span className="ux4g-tag__label">{children ?? label}</span>
      {onRemove && (
        <button type="button" className="ux4g-tag__remove" aria-label={removeLabel || "Remove " + (label || "tag")} onClick={onRemove}>
          <span className="ux4g-icon" aria-hidden="true">close</span>
        </button>
      )}
    </span>
  );
}
