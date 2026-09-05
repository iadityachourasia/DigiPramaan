import { getTranslations } from "next-intl/server";

/**
 * loading.tsx — the Suspense fallback for the [locale] segment.
 *
 * Next.js renders this while a Server Component is streaming. It must be
 * accessible: a spinner without a label is invisible to screen readers, so the
 * label is both the `role="status"` accessible name and visible text.
 */

export default async function Loading() {
  const t = await getTranslations("common");
  const label = t("loading");

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <div className="lmcs-loading-page" role="status" aria-label={label}>
        <span className="ux4g-spinner ux4g-spinner-lg" aria-hidden="true" />
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
          {label}
        </p>
      </div>
    </main>
  );
}
