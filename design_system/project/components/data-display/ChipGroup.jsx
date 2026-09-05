import * as React from "react";

/* UX4G Chip group (source: 8 frames) — a labelled, wrapping row of chips
   with single or multiple selection and an optional clear-all. */
export function ChipGroup({ label, chips = [], selected = [], multiple = true, onToggle, onClearAll, size = "M", className = "", ...rest }) {
  const cls = ["ux4g-chipgroup", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {label && <span className="ux4g-field__label">{label}</span>}
      <div className="ux4g-chipgroup__row" role={multiple ? "group" : "radiogroup"} aria-label={label}>
        {chips.map(c => {
          const val = c.value || c.label || c;
          const lab = c.label || c;
          const on = selected.includes(val);
          return (
            <button key={val} type="button" role={multiple ? undefined : "radio"}
              aria-pressed={multiple ? on : undefined} aria-checked={multiple ? undefined : on}
              className={"ux4g-chip ux4g-chip--" + size.toLowerCase() + (on ? " is-selected" : "")}
              onClick={() => onToggle && onToggle(val)}>
              {on && <span className="ux4g-icon ux4g-chip__icon" aria-hidden="true">check</span>}
              <span className="ux4g-chip__label">{lab}</span>
              {c.count != null && <span className="ux4g-chip__count">{c.count}</span>}
            </button>
          );
        })}
        {onClearAll && selected.length > 0 && (
          <button type="button" className="ux4g-chipgroup__clear" onClick={onClearAll}>Clear all</button>
        )}
      </div>
    </div>
  );
}
