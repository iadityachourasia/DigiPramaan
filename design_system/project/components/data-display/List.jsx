import * as React from "react";

/* UX4G List (source: _List Item — State 8 · Size 4 · Validation 4, plus dividers).
   Rows carry leading icon/avatar, title, supporting text, meta and trailing slot. */
export function List({ items = [], size = "M", divided = true, interactive = false, ordered = false, className = "", ...rest }) {
  const Tag = ordered ? "ol" : "ul";
  const cls = ["ux4g-list", `ux4g-list--${size.toLowerCase()}`, divided ? "is-divided" : "", className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} {...rest}>
      {items.map((it, i) => (
        <li key={i} className={"ux4g-list__item" + (it.selected ? " is-selected" : "") + (it.disabled ? " is-disabled" : "")} tabIndex={interactive && !it.disabled ? 0 : undefined}>
          {(it.icon || it.leading) && <span className="ux4g-list__leading">{it.leading || <span className="ux4g-icon" aria-hidden="true">{it.icon}</span>}</span>}
          <span className="ux4g-list__body">
            <span className="ux4g-list__title">{it.title}</span>
            {it.supporting && <span className="ux4g-list__supporting">{it.supporting}</span>}
          </span>
          {it.meta && <span className="ux4g-list__meta">{it.meta}</span>}
          {it.trailing && <span className="ux4g-list__trailing">{it.trailing}</span>}
        </li>
      ))}
    </Tag>
  );
}
