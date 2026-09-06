import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * Capture layout — deliberately no sidebar, header, or footer.
 *
 * 03-scan-upload.md §5 is explicit: the Mobile Capture Companion "intentionally
 * has no sidebar/header shell — it's a focused, single-purpose capture
 * surface, not a full app view." That rules out both `(auth)`'s AppShell and
 * `(public)`'s PublicMasthead/Footer (branded chrome this route doesn't want
 * either), so this is a third, minimal route group rather than a variant of
 * either existing one.
 *
 * No RequireAuth here either — this route is reached by scanning a QR code or
 * typing a short code, not by signing in. The session token in the URL (or
 * typed on /scan/mobile) is the access control, validated against the mobile
 * session store itself, not against the officer's own login session.
 */

interface CaptureLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function CaptureLayout({ children, params }: CaptureLayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("accessibility");

  return (
    <div className="lmcs-capture-shell">
      <a href="#main-content" className="lmcs-skip-link ux4g-btn ux4g-btn-primary">
        {t("skipToMain")}
      </a>
      {children}
    </div>
  );
}
