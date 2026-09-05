import * as React from "react";

/* UX4G Combobox — text input with a filtered selection list.
   Panel: elevated surface, radius 8, level-3 elevation, 40px rows (size M). */
export function Combobox({ label, hint, caption, status = "default", options = [], value, placeholder = "Select", multiple = false, open: openProp, disabled = false, onSelect, className = "", ...rest }) {
  const id = React.useId();
  const [open, setOpen] = React.useState(!!openProp);
  const [query, setQuery] = React.useState("");
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const shown = options.filter(o => (o.label || o).toLowerCase().includes(query.toLowerCase()));
  const cls = ["ux4g-combo", `is-${status}`, open ? "is-open" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {label && <label className="ux4g-field__label" htmlFor={id}>{label}</label>}
      {hint && <span className="ux4g-field__hint">{hint}</span>}
      <div className="ux4g-field__control" onClick={() => !disabled && setOpen(o => !o)}>
        {multiple && selected.length > 0 && (
          <span className="ux4g-combo__chips">
            {selected.map(s => <span key={s} className="ux4g-chip ux4g-chip--s">{s}</span>)}
          </span>
        )}
        <input id={id} className="ux4g-field__input" role="combobox" aria-expanded={open}
          aria-controls={id + "-list"} autoComplete="off" placeholder={placeholder} disabled={disabled}
          value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} />
        <span className="ux4g-icon ux4g-field__icon" aria-hidden="true">{open ? "arrow_drop_up" : "arrow_drop_down"}</span>
      </div>
      {open && (
        <ul className="ux4g-combo__panel" id={id + "-list"} role="listbox" aria-multiselectable={multiple || undefined}>
          {shown.length === 0 && <li className="ux4g-combo__empty">No matches</li>}
          {shown.map((o, i) => {
            const lab = o.label || o, val = o.value || lab;
            const on = selected.includes(val);
            return (
              <li key={i} role="option" aria-selected={on} tabIndex={0}
                className={"ux4g-combo__item" + (on ? " is-selected" : "")}
                onClick={() => onSelect && onSelect(val)}>
                {multiple && <span className="ux4g-icon" aria-hidden="true">{on ? "check_box" : "check_box_outline_blank"}</span>}
                <span className="ux4g-combo__item-label">{lab}</span>
                {!multiple && on && <span className="ux4g-icon" aria-hidden="true">check</span>}
              </li>
            );
          })}
        </ul>
      )}
      {caption && <span className="ux4g-field__caption"><span className="ux4g-icon" aria-hidden="true">{status === "error" ? "error" : "info"}</span>{caption}</span>}
    </div>
  );
}
