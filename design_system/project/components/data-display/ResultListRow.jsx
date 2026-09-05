import * as React from "react";

/* UX4G Result list row (source: 8 frames) — one search result:
   type marker, title link, snippet, breadcrumb path and metadata. */
export function ResultListRow({ title, href = "#", snippet, path = [], meta = [], type, thumbnail, tags, className = "", ...rest }) {
  const cls = ["ux4g-result", className].filter(Boolean).join(" ");
  return (
    <article className={cls} {...rest}>
      {thumbnail && <span className="ux4g-result__thumb">{thumbnail}</span>}
      <div className="ux4g-result__body">
        {type && <span className="ux4g-result__type"><span className="ux4g-icon" aria-hidden="true">{type.icon || "description"}</span>{type.label}</span>}
        <h3 className="ux4g-result__title"><a href={href}>{title}</a></h3>
        {path.length > 0 && <p className="ux4g-result__path">{path.join(" › ")}</p>}
        {snippet && <p className="ux4g-result__snippet">{snippet}</p>}
        {(meta.length > 0 || tags) && (
          <p className="ux4g-result__meta">
            {meta.map((m, i) => <span key={i}>{m}</span>)}
            {tags}
          </p>
        )}
      </div>
    </article>
  );
}
