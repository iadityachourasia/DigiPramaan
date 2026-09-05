import * as React from "react";

/* UX4G Tab (source: _Tab item — Type 3 · Size 3 · State 6 · Overflow 2, + _Tab content).
   Underline, contained and pill types; the active tab is marked by weight and
   indicator, not colour alone. */
export function Tab({ items = [], activeIndex = 0, type = "underline", size = "M", fullWidth = false, onChange, className = "", ...rest }) {
  const cls = ["ux4g-tabs", `ux4g-tabs--${type}`, `ux4g-tabs--${size.toLowerCase()}`, fullWidth ? "is-full" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <div className="ux4g-tabs__list" role="tablist">
        {items.map((it, i) => (
          <button key={i} type="button" role="tab" id={"tab-" + i} aria-selected={i === activeIndex}
            aria-controls={"panel-" + i} disabled={it.disabled}
            className={"ux4g-tabs__tab" + (i === activeIndex ? " is-active" : "")}
            onClick={() => onChange && onChange(i)}>
            {it.icon && <span className="ux4g-icon" aria-hidden="true">{it.icon}</span>}
            <span className="ux4g-tabs__label">{it.label}</span>
            {it.count != null && <span className="ux4g-tabs__count">{it.count}</span>}
          </button>
        ))}
      </div>
      {items[activeIndex] && items[activeIndex].content !== undefined && (
        <div className="ux4g-tabs__panel" role="tabpanel" id={"panel-" + activeIndex} aria-labelledby={"tab-" + activeIndex}>
          {items[activeIndex].content}
        </div>
      )}
    </div>
  );
}
