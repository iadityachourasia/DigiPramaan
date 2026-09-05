import * as React from "react";

/* UX4G Carousel (source: 7 frames + _carousel-indicator / -indicators / -nav / -caption).
   Manual advance only — no autoplay, per the source's nav-driven pattern. */
export function Carousel({ slides = [], index = 0, dark = false, showCaption = true, onIndexChange, className = "", ...rest }) {
  const [i, setI] = React.useState(index);
  const go = n => { const next = (n + slides.length) % slides.length; setI(next); onIndexChange && onIndexChange(next); };
  const cur = slides[i] || {};
  const cls = ["ux4g-carousel", dark ? "is-dark" : "", className].filter(Boolean).join(" ");
  return (
    <section className={cls} aria-roledescription="carousel" {...rest}>
      <div className="ux4g-carousel__viewport" aria-live="polite">
        <div className="ux4g-carousel__slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
          {cur.media}
          {showCaption && (cur.title || cur.caption) && (
            <div className="ux4g-carousel__caption">
              {cur.title && <p className="ux4g-carousel__title">{cur.title}</p>}
              {cur.caption && <p className="ux4g-carousel__text">{cur.caption}</p>}
            </div>
          )}
        </div>
      </div>
      <button type="button" className="ux4g-carousel__nav is-prev" aria-label="Previous slide" onClick={() => go(i - 1)}>
        <span className="ux4g-icon" aria-hidden="true">chevron_left</span>
      </button>
      <button type="button" className="ux4g-carousel__nav is-next" aria-label="Next slide" onClick={() => go(i + 1)}>
        <span className="ux4g-icon" aria-hidden="true">chevron_right</span>
      </button>
      <div className="ux4g-carousel__indicators">
        {slides.map((_, n) => (
          <button key={n} type="button" className={"ux4g-carousel__dot" + (n === i ? " is-active" : "")}
            aria-label={`Go to slide ${n + 1}`} aria-current={n === i} onClick={() => go(n)} />
        ))}
      </div>
    </section>
  );
}
