import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ACTIVE_LOCALES, LOCALE_LABELS } from "@/i18n/routing";
import { ROUTES } from "@/lib/constants";
import { DigiPramaanLogo } from "@/components/shared";

/**
 * PublicMasthead — the identity bar above every public page (landing + Login).
 *
 * Two rows, modelled on real Government-of-India digital services (DigiLocker
 * in particular) rather than a ministry-portal masthead: a slim, permanently
 * dark utility strip carrying the government context and the accessibility/
 * language affordances GIGW/BRD §9.4 requires, then a white identity row
 * carrying the DigiPramaan product mark — deliberately DigiPramaan's logo
 * alone, not paired with a separate emblem graphic (a real product decision,
 * not an oversight: earlier revisions showed the small Ashoka Chakra emblem
 * here, which is now dropped from the product entirely).
 *
 * `01-login.md` describes Login as standalone with no shared shell. That rule
 * is about the *app* shell — the sidebar and authenticated header. This
 * masthead is identity, not navigation, and a government sign-in page without
 * it reads as less trustworthy, not more. Because this row now carries the
 * product's own logo + name, `PublicNavbar` (the landing page's own nav,
 * rendered separately below this) no longer repeats them — see its own
 * comment.
 *
 * A Server Component: nothing here is interactive beyond links.
 */
export async function PublicMasthead() {
  const t = await getTranslations();

  return (
    <div className="lmcs-masthead">
      <div className="ux4g-container lmcs-masthead-utility-inner">
        <span className="ux4g-body-xs-default">{t("app.government")}</span>

        <div className="lmcs-masthead-actions">
          <Link
            href={ROUTES.accessibilityStatement}
            className="lmcs-masthead-link ux4g-body-xs-default"
          >
            {t("accessibility.screenReaderAccess")}
          </Link>

          {/*
            The switcher is rendered only when more than one locale is actually
            complete. BRD §9.1 ships English alone at launch with Hindi
            scaffolded, and offering a language whose catalogue is still English
            underneath would be worse than not offering it.
          */}
          {ACTIVE_LOCALES.length > 1 ? (
            <span className="ux4g-body-xs-default">
              {ACTIVE_LOCALES.map((locale) => LOCALE_LABELS[locale]).join(" · ")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ux4g-container lmcs-masthead-identity-inner">
        <Link href="/" className="lmcs-masthead-brand">
          <DigiPramaanLogo size="md" className="lmcs-brand-mark-compact" />
          <div className="lmcs-masthead-titles">
            <span className="ux4g-title-s-strong">{t("app.name")}</span>
            <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {t("app.descriptor")}
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
