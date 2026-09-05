import * as React from "react";

/* UX4G Accordion (source: 8 frames + _Accordion content).
   Native <details>/<summary> so it works without JS and is keyboard-operable. */
export function Accordion({ items = [], multiple = false, size = "M", divided = true, className = "", ...rest }) {
  const cls = ["ux4g-accordion", `ux4g-accordion--${size.toLowerCase()}`, divided ? "is-divided" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {items.map((it, i) => (
        <details key={i} className="ux4g-accordion__item" open={it.open} name={multiple ? undefined : "ux4g-accordion"}>
          <summary className="ux4g-accordion__summary">
            {it.icon && <span className="ux4g-icon ux4g-accordion__icon" aria-hidden="true">{it.icon}</span>}
            <span className="ux4g-accordion__titles">
              <span className="ux4g-accordion__title">{it.title}</span>
              {it.supporting && <span className="ux4g-accordion__supporting">{it.supporting}</span>}
            </span>
            {it.meta && <span className="ux4g-accordion__meta">{it.meta}</span>}
            <span className="ux4g-icon ux4g-accordion__chevron" aria-hidden="true">expand_more</span>
          </summary>
          <div className="ux4g-accordion__content">{it.content}</div>
        </details>
      ))}
    </div>
  );
}
