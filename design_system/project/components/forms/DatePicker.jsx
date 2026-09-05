import * as React from "react";

/* UX4G Date Picker. Source atoms: _Date - Time Field (8 states), _Date cell
   (Device 2 · State 4 · Day type 5 · Selection 6), _Day label, _Date Picker menu.
   Calendar: 7-column grid, 40px cells, elevated panel at level 3. */
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
export function DatePicker({ label = "Date", value = "", placeholder = "DD/MM/YYYY", status = "default", caption, open: openProp = false, month = "September 2026", firstWeekday = 2, daysInMonth = 30, selectedDay, today, disabled = false, onSelectDay, className = "", ...rest }) {
  const id = React.useId();
  const [open, setOpen] = React.useState(openProp);
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const cls = ["ux4g-datepicker", `is-${status}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <div className={"ux4g-field ux4g-field--m is-" + status}>
        <label className="ux4g-field__label" htmlFor={id}>{label}</label>
        <div className="ux4g-field__control">
          <input id={id} className="ux4g-field__input" placeholder={placeholder} value={value} disabled={disabled} readOnly aria-haspopup="dialog" aria-expanded={open} />
          <button type="button" className="ux4g-field__iconbtn" aria-label="Open calendar" onClick={() => setOpen(o => !o)}>
            <span className="ux4g-icon" aria-hidden="true">calendar_month</span>
          </button>
        </div>
        {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : "info"}</span>{caption}</span>}
      </div>
      {open && (
        <div className="ux4g-cal" role="dialog" aria-label={"Choose a date, " + month}>
          <div className="ux4g-cal__head">
            <button type="button" className="ux4g-field__iconbtn" aria-label="Previous month"><span className="ux4g-icon" aria-hidden="true">chevron_left</span></button>
            <span className="ux4g-cal__month">{month}</span>
            <button type="button" className="ux4g-field__iconbtn" aria-label="Next month"><span className="ux4g-icon" aria-hidden="true">chevron_right</span></button>
          </div>
          <div className="ux4g-cal__grid" role="grid">
            {DAYS.map((d, i) => <span key={"h" + i} className="ux4g-cal__daylabel" role="columnheader">{d}</span>)}
            {cells.map((d, i) => d === null
              ? <span key={"e" + i} className="ux4g-cal__cell is-empty" />
              : <button key={d} type="button" role="gridcell"
                  className={"ux4g-cal__cell" + (d === selectedDay ? " is-selected" : "") + (d === today ? " is-today" : "")}
                  aria-selected={d === selectedDay} onClick={() => onSelectDay && onSelectDay(d)}>{d}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
