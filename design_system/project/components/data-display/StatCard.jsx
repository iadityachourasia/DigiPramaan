import * as React from "react";

/* UX4G KPI stat card — label, large value, delta with direction.
   Built from Card's surface rules; the delta states direction in text and glyph,
   never by colour alone. */
export function StatCard({ label, value, unit, delta, deltaDirection = "flat", deltaLabel, icon, footnote, className = "", ...rest }) {
  const dirIcon = { up: "trending_up", down: "trending_down", flat: "trending_flat" }[deltaDirection];
  const cls = ["ux4g-stat", `ux4g-stat--${deltaDirection}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <span className="ux4g-stat__head">
        <span className="ux4g-stat__label">{label}</span>
        {icon && <span className="ux4g-icon ux4g-stat__icon" aria-hidden="true">{icon}</span>}
      </span>
      <span className="ux4g-stat__value">{value}{unit && <span className="ux4g-stat__unit">{unit}</span>}</span>
      {delta != null && (
        <span className="ux4g-stat__delta">
          <span className="ux4g-icon" aria-hidden="true">{dirIcon}</span>
          {delta}
          <span className="ux4g-stat__delta-label">{deltaLabel || "vs previous period"}</span>
        </span>
      )}
      {footnote && <span className="ux4g-stat__foot">{footnote}</span>}
    </div>
  );
}
