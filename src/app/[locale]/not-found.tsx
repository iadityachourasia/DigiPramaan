import { getTranslations } from "next-intl/server";

/**
 * not-found.tsx — the 404 page for the [locale] segment.
 *
 * GIGW requires every government website to have a branded 404 page rather
 * than the browser default. This renders using server translations so the
 * content is in the user's language.
 */

export default async function NotFoundPage() {
  const t = await getTranslations("errors");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <div className="lmcs-error-page">
        <span
          className="ux4g-icon-outlined lmcs-error-page-icon"
          aria-hidden="true"
        >
          search_off
        </span>

        <h1 className="ux4g-heading-xl-strong">{t("notFoundTitle")}</h1>
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {t("notFoundBody")}
        </p>

        <a
          href="/"
          className="ux4g-btn ux4g-btn-secondary ux4g-mt-m"
        >
          {t("returnToDashboard")}
        </a>
      </div>
    </main>
  );
}
