import * as React from "react";

/* UX4G Slider. Source atoms: _Slider track (Size 2 · State 3), _Slider thumb (Size 2 · State 5),
   _Slider tick marks, _Slider values, _Range Slider item. Track 4px, thumb 20px (M) / 16px (S). */
export function Slider({ label, min = 0, max = 100, step = 1, value = 50, size = "M", showTicks = false, showValues = false, unit = "", disabled = false, onChange, className = "", ...rest }) {
  const id = React.useId();
  const pct = ((value - min) / (max - min)) * 100;
  const ticks = showTicks ? Array.from({ length: 5 }, (_, i) => min + ((max - min) / 4) * i) : [];
  const cls = ["ux4g-slider", `ux4g-slider--${size.toLowerCase()}`, disabled ? "is-disabled" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {label && <label className="ux4g-field__label" htmlFor={id}>{label}</label>}
      <div className="ux4g-slider__row">
        <input id={id} type="range" className="ux4g-slider__input" min={min} max={max} step={step}
          value={value} disabled={disabled} onChange={onChange}
          style={{ "--ux4g-slider-pct": pct + "%" }}
          aria-valuetext={value + unit} />
        <output className="ux4g-slider__value" htmlFor={id}>{value}{unit}</output>
      </div>
      {showTicks && <div className="ux4g-slider__ticks" aria-hidden="true">{ticks.map((t, i) => <span key={i} className="ux4g-slider__tick" />)}</div>}
      {showValues && <div className="ux4g-slider__values" aria-hidden="true">{ticks.map((t, i) => <span key={i}>{t}{unit}</span>)}</div>}
    </div>
  );
}
