import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ACTIVE_LOCALES, LOCALE_LABELS } from "@/i18n/routing";
import { ROUTES } from "@/lib/constants";

/**
 * PublicMasthead — the government identity bar above every public page.
 *
 * BRD §9.4 requires "Screen reader access" in the header of all pages and the
 * Department attribution on the public surfaces, so this sits in the `(public)`
 * layout rather than on the landing page alone.
 *
 * `01-login.md` describes Login as standalone with no shared shell. That rule is
 * about the *app* shell — the sidebar and authenticated header. A GIGW masthead
 * is identity, not navigation, and a government sign-in page without it reads as
 * less trustworthy, not more. The navbar with its in-page anchors and sign-in
 * CTA stays on the landing page only, which is what keeps Login uncluttered.
 *
 * A Server Component: nothing here is interactive beyond links.
 */
export async function PublicMasthead() {
  const t = await getTranslations();

  return (
    <div className="lmcs-masthead">
      <div className="ux4g-container lmcs-masthead-inner">
        <div className="lmcs-masthead-identity">
          <Image
            src="/images/emblem.svg"
            alt={t("app.emblemAlt")}
            className="lmcs-masthead-emblem"
            width={28}
            height={28}
            unoptimized
          />
          <span className="ux4g-body-xs-default">{t("app.government")}</span>
        </div>

        <div className="lmcs-masthead-actions">
          <Link
            href={ROUTES.accessibilityStatement}
            className="lmcs-link ux4g-body-xs-default"
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
            <span className="ux4g-body-xs-default ux4g-text-neutral-secondary">
              {ACTIVE_LOCALES.map((locale) => LOCALE_LABELS[locale]).join(" · ")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
