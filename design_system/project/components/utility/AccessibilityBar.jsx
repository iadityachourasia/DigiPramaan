import * as React from "react";

/* UX4G Accessibility Bar (source: 8 frames) — the government accessibility strip:
   text resizing, contrast mode, language, and skip link. Sits above the masthead. */
export function AccessibilityBar({ textScale = 100, contrast = "normal", language = "en", languages = [{ code: "en", label: "English" }, { code: "hi", label: "हिन्दी" }], skipHref = "#main", onTextScale, onContrast, onLanguage, className = "", ...rest }) {
  const cls = ["ux4g-a11ybar", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      <a className="ux4g-a11ybar__skip" href={skipHref}>Skip to main content</a>
      <div className="ux4g-a11ybar__group" role="group" aria-label="Text size">
        <button type="button" className="ux4g-a11ybar__btn" aria-label="Decrease text size" onClick={() => onTextScale && onTextScale(Math.max(90, textScale - 10))}>A-</button>
        <button type="button" className="ux4g-a11ybar__btn" aria-label="Reset text size" aria-pressed={textScale === 100} onClick={() => onTextScale && onTextScale(100)}>A</button>
        <button type="button" className="ux4g-a11ybar__btn" aria-label="Increase text size" onClick={() => onTextScale && onTextScale(Math.min(130, textScale + 10))}>A+</button>
      </div>
      <button type="button" className="ux4g-a11ybar__btn" aria-pressed={contrast === "high"} onClick={() => onContrast && onContrast(contrast === "high" ? "normal" : "high")}>
        <span className="ux4g-icon" aria-hidden="true">contrast</span>High contrast
      </button>
      <label className="ux4g-a11ybar__lang">
        <span className="ux4g-sr-only">Language</span>
        <span className="ux4g-icon" aria-hidden="true">language</span>
        <select value={language} onChange={e => onLanguage && onLanguage(e.target.value)}>
          {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
    </div>
  );
}
