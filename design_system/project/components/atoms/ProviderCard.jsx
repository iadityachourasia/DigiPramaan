import * as React from "react";

/* UX4G _Provider card (source axes: Device 2). One identity-provider or
   sign-in-method choice on the identity-and-access screens. */
export function ProviderCard({ name, description, icon = "verified_user", logo, recommended = false, selected = false, disabled = false, unavailableNote, onSelect, className = "", ...rest }) {
  const cls = ["ux4g-provider", selected ? "is-selected" : "", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} aria-pressed={selected} disabled={disabled} onClick={onSelect} {...rest}>
      <span className="ux4g-provider__lead">{logo || <span className="ux4g-icon" aria-hidden="true">{icon}</span>}</span>
      <span className="ux4g-provider__body">
        <span className="ux4g-provider__name">
          {name}
          {recommended && <span className="ux4g-provider__rec">Recommended</span>}
        </span>
        {description && <span className="ux4g-provider__desc">{description}</span>}
        {disabled && unavailableNote && <span className="ux4g-provider__note">{unavailableNote}</span>}
      </span>
      {!disabled && <span className="ux4g-icon ux4g-provider__chev" aria-hidden="true">chevron_right</span>}
    </button>
  );
}
