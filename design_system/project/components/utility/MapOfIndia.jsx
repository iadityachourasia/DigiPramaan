import * as React from "react";

/* UX4G Map of India (source: 8 frames + union-territory icon family).
   The source's map geometry has not been copied into this project yet, so this
   component takes the SVG (or an <img>) as `map` and layers the interaction,
   legend and accessible data table on top. It never draws an approximate India. */
export function MapOfIndia({ map, regions = [], selected, legend = [], title = "Regional view", unit = "", onSelectRegion, showTable = true, className = "", ...rest }) {
  const cls = ["ux4g-map", className].filter(Boolean).join(" ");
  return (
    <figure className={cls} {...rest}>
      <div className="ux4g-map__stage">
        {map || (
          <div className="ux4g-map__missing">
            <span className="ux4g-icon" aria-hidden="true">map</span>
            <p className="ux4g-map__missingtext">Map geometry not supplied. Pass the source SVG as <code>map</code>.</p>
          </div>
        )}
      </div>
      {legend.length > 0 && (
        <ul className="ux4g-map__legend">
          {legend.map((l, i) => (
            <li key={i} className="ux4g-map__legenditem">
              <span className="ux4g-map__swatch" style={{ background: l.color }} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {showTable && regions.length > 0 && (
        <table className="ux4g-map__table">
          <caption className="ux4g-map__caption">{title} — full data</caption>
          <thead><tr><th scope="col">Region</th><th scope="col">Value</th><th scope="col">Band</th></tr></thead>
          <tbody>
            {regions.map(r => (
              <tr key={r.code || r.name} className={selected === (r.code || r.name) ? "is-selected" : undefined}
                tabIndex={0} onClick={() => onSelectRegion && onSelectRegion(r.code || r.name)}>
                <th scope="row">{r.name}</th>
                <td>{r.value}{unit}</td>
                <td>{r.band}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
