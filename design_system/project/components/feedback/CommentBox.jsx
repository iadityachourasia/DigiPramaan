import * as React from "react";

/* UX4G Comment Box (source: 5 frames) — threaded remarks on a record. */
export function CommentBox({ comments = [], placeholder = "Add a remark", submitLabel = "Post remark", maxLength = 1000, onSubmit, className = "", ...rest }) {
  const cls = ["ux4g-comments", className].filter(Boolean).join(" ");
  return (
    <section className={cls} {...rest}>
      {comments.length > 0 && (
        <ul className="ux4g-comments__list">
          {comments.map((c, i) => (
            <li key={i} className="ux4g-comments__item">
              <span className="ux4g-comments__avatar" aria-hidden="true">{(c.author || "?").split(" ").map(w => w[0]).slice(0, 2).join("")}</span>
              <div className="ux4g-comments__body">
                <p className="ux4g-comments__meta"><strong>{c.author}</strong>{c.role && <span className="ux4g-comments__role">{c.role}</span>}<span className="ux4g-comments__time">{c.time}</span></p>
                <p className="ux4g-comments__text">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="ux4g-comments__compose">
        <textarea className="ux4g-comments__input" rows={3} placeholder={placeholder} maxLength={maxLength} aria-label={placeholder} />
        <div className="ux4g-comments__actions">
          <button type="button" className="ux4g-btn ux4g-btn--filled ux4g-btn--m" onClick={onSubmit}><span className="ux4g-btn__label">{submitLabel}</span></button>
        </div>
      </div>
    </section>
  );
}
