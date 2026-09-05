import * as React from "react";

/* UX4G Dropdown Menu — action menu anchored to a trigger.
   Source atoms: _Action menu item (State 5 · Size 2 · Validation 4), dividers, leading/trailing icon switches. */
export function DropdownMenu({ triggerLabel = "Actions", items = [], size = "M", open: openProp = false, align = "start", onAction, className = "", ...rest }) {
  const [open, setOpen] = React.useState(openProp);
  const cls = ["ux4g-menu", `ux4g-menu--${size.toLowerCase()}`, `ux4g-menu--${align}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <button type="button" className="ux4g-btn ux4g-btn--outlined ux4g-btn--m" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="ux4g-btn__label">{triggerLabel}</span>
        <span className="ux4g-icon ux4g-btn__icon" aria-hidden="true">{open ? "arrow_drop_up" : "arrow_drop_down"}</span>
      </button>
      {open && (
        <ul className="ux4g-menu__panel" role="menu">
          {items.map((it, i) => it.divider ? <li key={i} className="ux4g-menu__divider" role="separator" /> : (
            <li key={i} role="menuitem" tabIndex={it.disabled ? -1 : 0}
              aria-disabled={it.disabled || undefined}
              className={"ux4g-menu__item" + (it.danger ? " is-danger" : "") + (it.disabled ? " is-disabled" : "")}
              onClick={() => !it.disabled && onAction && onAction(it.value || it.label)}>
              {it.icon && <span className="ux4g-icon" aria-hidden="true">{it.icon}</span>}
              <span className="ux4g-menu__item-label">{it.label}</span>
              {it.shortcut && <span className="ux4g-menu__shortcut">{it.shortcut}</span>}
              {it.trailingIcon && <span className="ux4g-icon" aria-hidden="true">{it.trailingIcon}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
