import * as React from "react";

/* UX4G Color Picker (source: _color-picker-swatch + 5 frames).
   A constrained swatch grid — the system deliberately offers no free-form picker. */
export function ColorPicker({ label = "Colour", swatches = [], value, disabled = false, onSelect, className = "", ...rest }) {
  const cls = ["ux4g-colorpicker", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <span className="ux4g-field__label">{label}</span>
      <div className="ux4g-colorpicker__grid" role="radiogroup" aria-label={label}>
        {swatches.map(s => {
          const val = s.value || s, name = s.name || s;
          const on = val === value;
          return (
            <button key={val} type="button" role="radio" aria-checked={on} disabled={disabled}
              className={"ux4g-colorpicker__swatch" + (on ? " is-selected" : "")}
              style={{ background: val }} onClick={() => onSelect && onSelect(val)}>
              <span className="ux4g-sr-only">{name}</span>
              {on && <span className="ux4g-icon" aria-hidden="true">check</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
