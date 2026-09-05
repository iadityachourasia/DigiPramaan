/**
 * loading.tsx — the Suspense fallback for the [locale] segment.
 *
 * Next.js renders this while a Server Component is streaming. It must be
 * accessible: a spinner without a label is invisible to screen readers.
 */

export default function Loading() {
  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <div className="lmcs-loading-page" role="status" aria-label="Loading">
        <span className="ux4g-spinner ux4g-spinner-lg" aria-hidden="true" />
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
          Loading…
        </p>
      </div>
    </main>
  );
}
