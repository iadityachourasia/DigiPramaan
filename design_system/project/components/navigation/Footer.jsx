import * as React from "react";

/* UX4G Footer (source: 8 frames + _Footer access items, _Footer Link, _Bottom Links,
   _Subscribe Newsletter, _Powered by). Link columns, the government access row,
   and the statutory bottom strip. */
export function Footer({ columns = [], accessLinks = [], bottomLinks = [], copyright, poweredBy, logos, newsletter = false, variant = "light", className = "", ...rest }) {
  const cls = ["ux4g-footer", `ux4g-footer--${variant}`, className].filter(Boolean).join(" ");
  return (
    <footer className={cls} {...rest}>
      {columns.length > 0 && (
        <div className="ux4g-footer__cols">
          {columns.map((c, i) => (
            <nav key={i} className="ux4g-footer__col" aria-label={c.title}>
              <p className="ux4g-footer__coltitle">{c.title}</p>
              <ul className="ux4g-footer__list">
                {c.links.map((l, j) => <li key={j}><a className="ux4g-footer__link" href={l.href || "#"}>{l.label}</a></li>)}
              </ul>
            </nav>
          ))}
          {newsletter && (
            <form className="ux4g-footer__newsletter">
              <p className="ux4g-footer__coltitle">Get updates</p>
              <label className="ux4g-sr-only" htmlFor="ux4g-newsletter">Email address</label>
              <div className="ux4g-footer__newsrow">
                <input id="ux4g-newsletter" className="ux4g-footer__newsinput" type="email" placeholder="name@example.gov.in" />
                <button type="submit" className="ux4g-btn ux4g-btn--filled ux4g-btn--m"><span className="ux4g-btn__label">Subscribe</span></button>
              </div>
            </form>
          )}
        </div>
      )}
      {(accessLinks.length > 0 || logos) && (
        <div className="ux4g-footer__access">
          {logos && <div className="ux4g-footer__logos">{logos}</div>}
          {accessLinks.length > 0 && (
            <ul className="ux4g-footer__accesslist">
              {accessLinks.map((l, i) => <li key={i}><a className="ux4g-footer__link" href={l.href || "#"}>{l.label}</a></li>)}
            </ul>
          )}
        </div>
      )}
      <div className="ux4g-footer__bottom">
        <p className="ux4g-footer__copy">{copyright}</p>
        {bottomLinks.length > 0 && (
          <ul className="ux4g-footer__bottomlist">
            {bottomLinks.map((l, i) => <li key={i}><a className="ux4g-footer__link" href={l.href || "#"}>{l.label}</a></li>)}
          </ul>
        )}
        {poweredBy && <p className="ux4g-footer__powered">{poweredBy}</p>}
      </div>
    </footer>
  );
}
