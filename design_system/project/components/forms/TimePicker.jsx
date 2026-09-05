import * as React from "react";

/* UX4G Time Picker — field plus hour/minute/period columns (source: 8 frames). */
export function TimePicker({ label = "Time", value = "", status = "default", caption, open: openProp = false, use24Hour = false, selected = { h: 10, m: 30, p: "AM" }, disabled = false, onSelect, className = "", ...rest }) {
  const id = React.useId();
  const [open, setOpen] = React.useState(openProp);
  const hours = use24Hour ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i + 1);
  const mins = [0, 15, 30, 45];
  const cls = ["ux4g-timepicker", `is-${status}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <div className={"ux4g-field ux4g-field--m is-" + status}>
        <label className="ux4g-field__label" htmlFor={id}>{label}</label>
        <div className="ux4g-field__control">
          <input id={id} className="ux4g-field__input" placeholder={use24Hour ? "HH:MM" : "HH:MM AM"} value={value} disabled={disabled} readOnly aria-haspopup="dialog" aria-expanded={open} />
          <button type="button" className="ux4g-field__iconbtn" aria-label="Open time picker" onClick={() => setOpen(o => !o)}>
            <span className="ux4g-icon" aria-hidden="true">schedule</span>
          </button>
        </div>
        {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">info</span>{caption}</span>}
      </div>
      {open && (
        <div className="ux4g-time" role="dialog" aria-label="Choose a time">
          <ul className="ux4g-time__col" role="listbox" aria-label="Hour">
            {hours.map(h => <li key={h} role="option" tabIndex={0} aria-selected={h === selected.h} className={"ux4g-time__opt" + (h === selected.h ? " is-selected" : "")} onClick={() => onSelect && onSelect({ ...selected, h })}>{String(h).padStart(2, "0")}</li>)}
          </ul>
          <ul className="ux4g-time__col" role="listbox" aria-label="Minute">
            {mins.map(m => <li key={m} role="option" tabIndex={0} aria-selected={m === selected.m} className={"ux4g-time__opt" + (m === selected.m ? " is-selected" : "")} onClick={() => onSelect && onSelect({ ...selected, m })}>{String(m).padStart(2, "0")}</li>)}
          </ul>
          {!use24Hour && (
            <ul className="ux4g-time__col" role="listbox" aria-label="Period">
              {["AM", "PM"].map(p => <li key={p} role="option" tabIndex={0} aria-selected={p === selected.p} className={"ux4g-time__opt" + (p === selected.p ? " is-selected" : "")} onClick={() => onSelect && onSelect({ ...selected, p })}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
