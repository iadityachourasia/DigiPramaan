import * as React from "react";

/* UX4G _Powered by (source axes: Layout 2). The attribution strip at the base of a
   footer or an embedded widget. */
export function PoweredBy({ text = "Powered by", name = "UX4G", logo, href, layout = "inline", className = "", ...rest }) {
  const cls = ["ux4g-poweredby", `ux4g-poweredby--${layout}`, className].filter(Boolean).join(" ");
  const body = <>{logo}{!logo && <span className="ux4g-poweredby__name">{name}</span>}</>;
  return (
    <span className={cls} {...rest}>
      <span className="ux4g-poweredby__text">{text}</span>
      {href ? <a className="ux4g-poweredby__link" href={href}>{body}</a> : body}
    </span>
  );
}
