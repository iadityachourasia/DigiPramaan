import * as React from "react";

/* UX4G Time slot (source: 7 frames) — selectable appointment slots grouped by
   part of day, with availability stated in words. */
export function TimeSlot({ groups = [], selected, onSelect, className = "", ...rest }) {
  const cls = ["ux4g-slots", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {groups.map((g, gi) => (
        <div key={gi} className="ux4g-slots__group">
          <p className="ux4g-slots__grouplabel">{g.label}</p>
          <div className="ux4g-slots__row" role="radiogroup" aria-label={g.label}>
            {g.slots.map((s, si) => {
              const val = s.value || s.time;
              const full = s.remaining === 0 || s.disabled;
              return (
                <button key={si} type="button" role="radio" aria-checked={selected === val} disabled={full}
                  className={"ux4g-slots__slot" + (selected === val ? " is-selected" : "") + (full ? " is-full" : "")}
                  onClick={() => onSelect && onSelect(val)}>
                  <span className="ux4g-slots__time">{s.time}</span>
                  <span className="ux4g-slots__avail">{full ? "Full" : s.remaining != null ? s.remaining + " left" : "Available"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
