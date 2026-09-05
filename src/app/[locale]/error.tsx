"use client";

/**
 * error.tsx — the error boundary for the [locale] segment.
 *
 * Next.js App Router requires this to be a Client Component. It catches
 * runtime errors in any page under [locale]/ and shows a recovery UI
 * rather than a raw error trace — which is unacceptable for a government
 * website visible to enforcement officers.
 */

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/Alert";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  /* Log for monitoring; never expose the stack to the user. */
  console.error("[LMCS] Unhandled error:", error.message, error.digest);

  return (
    <main id="main-content" className="ux4g-container ux4g-py-xl">
      <div className="lmcs-error-page">
        <span
          className="ux4g-icon-outlined lmcs-error-page-icon"
          aria-hidden="true"
        >
          error_outline
        </span>

        <Alert
          severity="error"
          title={t("genericTitle")}
          live="assertive"
          actions={
            <button
              type="button"
              className="ux4g-btn ux4g-btn-outline-primary"
              onClick={reset}
            >
              {tCommon("actions.retry")}
            </button>
          }
        >
          {t("genericBody")}
        </Alert>
      </div>
    </main>
  );
}
