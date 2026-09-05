import * as React from "react";

/* UX4G Image (source: 8 frames) — ratio-locked media with caption and
   loading/error fallbacks. Copies real bitmaps; never a redrawn placeholder. */
export function Image({ src, alt = "", ratio = "16/9", fit = "cover", caption, credit, rounded = true, state = "loaded", className = "", ...rest }) {
  const cls = ["ux4g-image", rounded ? "is-rounded" : "", `is-${state}`, className].filter(Boolean).join(" ");
  return (
    <figure className={cls} {...rest}>
      <span className="ux4g-image__frame" style={{ aspectRatio: ratio }}>
        {state === "loaded" && src && <img className="ux4g-image__img" src={src} alt={alt} style={{ objectFit: fit }} />}
        {state !== "loaded" && (
          <span className="ux4g-image__fallback">
            <span className="ux4g-icon" aria-hidden="true">{state === "error" ? "broken_image" : "image"}</span>
            {state === "error" && <span className="ux4g-image__fallback-text">Image unavailable</span>}
          </span>
        )}
      </span>
      {(caption || credit) && (
        <figcaption className="ux4g-image__caption">
          {caption}{credit && <span className="ux4g-image__credit">{credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
