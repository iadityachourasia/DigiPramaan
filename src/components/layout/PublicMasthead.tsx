import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ACTIVE_LOCALES, LOCALE_LABELS } from "@/i18n/routing";
import { ROUTES } from "@/lib/constants";

/**
 * PublicMasthead — the statutory attribution bar above every public page.
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
          {/*
            BRD §9.4's Department-of-Consumer-Affairs-attribution-plus-emblem
            requirement is named for exactly two surfaces: this masthead
            (shown above Login and the Citizen Grievance Portal) and Login's
            own card header. The product's own name is carried separately by
            the label beside it — this image is specifically the government
            trust signal, not a product mark.
          */}
          <span className="lmcs-brand-mark lmcs-brand-mark-masthead">
            <Image
              src="/images/emblem.svg"
              alt={t("app.emblemAlt")}
              width={20}
              height={20}
              unoptimized
            />
          </span>
          <span className="ux4g-body-xs-strong">{t("app.name")}</span>
          <span className="ux4g-body-xs-default ux4g-text-neutral-secondary">
            {t("app.government")}
          </span>
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
