import * as React from "react";

/* UX4G Search. Source axes: Size (4) · State (7) · Search button on/off. */
export function Search({ label, placeholder = "Search", value, size = "M", withButton = false, buttonLabel = "Search", suggestions, onChange, onSubmit, disabled = false, className = "", ...rest }) {
  const id = React.useId();
  const cls = ["ux4g-search", `ux4g-search--${size.toLowerCase()}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="search" {...rest}>
      {label && <label className="ux4g-field__label" htmlFor={id}>{label}</label>}
      <div className="ux4g-search__row">
        <div className="ux4g-field__control">
          <span className="ux4g-icon ux4g-field__icon" aria-hidden="true">search</span>
          <input id={id} type="search" className="ux4g-field__input" placeholder={placeholder} value={value} disabled={disabled} onChange={onChange} />
          {value ? <button type="button" className="ux4g-search__clear" aria-label="Clear search"><span className="ux4g-icon" aria-hidden="true">close</span></button> : null}
        </div>
        {withButton && <button type="button" className="ux4g-btn ux4g-btn--filled ux4g-btn--m" onClick={onSubmit}><span className="ux4g-btn__label">{buttonLabel}</span></button>}
      </div>
      {suggestions && suggestions.length > 0 && (
        <ul className="ux4g-search__panel" role="listbox">
          {suggestions.map((s, i) => (
            <li key={i} role="option" aria-selected="false" className="ux4g-search__item">
              <span className="ux4g-icon" aria-hidden="true">history</span>{s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
