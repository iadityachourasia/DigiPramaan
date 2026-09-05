import * as React from "react";

/* UX4G Feedback — the satisfaction/NPS/star widget (source atoms: _Emoji item wrapper
   (Sentiment 5 · Selected 2), _feedback/stars (6 states), _NPS rating item, _like-dislike). */
const EMOJI = [
  { key: "very-dissatisfied", icon: "sentiment_very_dissatisfied", label: "Very dissatisfied" },
  { key: "dissatisfied", icon: "sentiment_dissatisfied", label: "Dissatisfied" },
  { key: "neutral", icon: "sentiment_neutral", label: "Neutral" },
  { key: "satisfied", icon: "sentiment_satisfied", label: "Satisfied" },
  { key: "very-satisfied", icon: "sentiment_very_satisfied", label: "Very satisfied" },
];
export function Feedback({ type = "sentiment", question = "How was your experience?", value, max = 10, onSelect, comment = false, submitLabel = "Submit feedback", className = "", ...rest }) {
  const cls = ["ux4g-feedback", `ux4g-feedback--${type}`, className].filter(Boolean).join(" ");
  return (
    <section className={cls} {...rest}>
      <p className="ux4g-feedback__q">{question}</p>
      {type === "sentiment" && (
        <div className="ux4g-feedback__row" role="radiogroup" aria-label={question}>
          {EMOJI.map(e => (
            <button key={e.key} type="button" role="radio" aria-checked={value === e.key}
              className={"ux4g-feedback__emoji" + (value === e.key ? " is-selected" : "")}
              onClick={() => onSelect && onSelect(e.key)}>
              <span className="ux4g-icon" aria-hidden="true">{e.icon}</span>
              <span className="ux4g-feedback__emoji-label">{e.label}</span>
            </button>
          ))}
        </div>
      )}
      {type === "stars" && (
        <div className="ux4g-feedback__row" role="radiogroup" aria-label={question}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={n + " of 5"}
              className={"ux4g-feedback__star" + (value >= n ? " is-on" : "")} onClick={() => onSelect && onSelect(n)}>
              <span className="ux4g-icon" data-fill={value >= n ? "true" : "false"} aria-hidden="true">star</span>
            </button>
          ))}
        </div>
      )}
      {type === "nps" && (
        <div className="ux4g-feedback__nps" role="radiogroup" aria-label={question}>
          {Array.from({ length: max + 1 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n}
              className={"ux4g-feedback__npsitem" + (value === n ? " is-selected" : "")} onClick={() => onSelect && onSelect(n)}>{n}</button>
          ))}
        </div>
      )}
      {type === "like" && (
        <div className="ux4g-feedback__row" role="group" aria-label={question}>
          <button type="button" className={"ux4g-feedback__like" + (value === "up" ? " is-selected" : "")} onClick={() => onSelect && onSelect("up")}>
            <span className="ux4g-icon" aria-hidden="true">thumb_up</span>Yes
          </button>
          <button type="button" className={"ux4g-feedback__like" + (value === "down" ? " is-selected" : "")} onClick={() => onSelect && onSelect("down")}>
            <span className="ux4g-icon" aria-hidden="true">thumb_down</span>No
          </button>
        </div>
      )}
      {comment && <textarea className="ux4g-feedback__comment" rows={3} placeholder="Tell us more (optional)" aria-label="Additional comments" />}
      {comment && <button type="button" className="ux4g-btn ux4g-btn--filled ux4g-btn--m"><span className="ux4g-btn__label">{submitLabel}</span></button>}
    </section>
  );
}
