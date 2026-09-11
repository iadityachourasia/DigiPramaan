"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/lib/hooks";
import { sessionWarnMinutes } from "@/providers/AuthProvider";

/**
 * SessionExpiryWarning — BRD A-11 / WCAG 2.2.1's "warn before a session
 * expires and offer an extension." Renders nothing until `AuthProvider`'s
 * own timer flips `sessionWarning` on; disappears again the moment
 * `extendSession` succeeds (a new `session` value resets that timer) or the
 * officer signs out.
 *
 * Lives in `AppShell`, alongside `Header`, so it's visible on every
 * authenticated page regardless of which one the warning fires on.
 */
export function SessionExpiryWarning() {
  const t = useTranslations("session");
  const { session, sessionWarning, extendSession, signOut } = useAuth();
  const [extending, setExtending] = useState(false);

  if (!sessionWarning || !session) return null;

  async function handleStaySignedIn() {
    setExtending(true);
    const ok = await extendSession();
    /*
     * On success `session` changes, which resets AuthProvider's warning
     * timer and unmounts this component — no local "extended" state needed.
     * On failure the refresh token itself was rejected, so there is
     * nothing left to extend; `signOut()` navigates away immediately,
     * which is why there's no failure copy to show here either.
     */
    if (!ok) signOut();
    else setExtending(false);
  }

  return (
    <div className="lmcs-session-expiry-warning">
      <Alert
        severity="warning"
        title={t("warningTitle")}
        live="assertive"
        actions={
          <>
            <button
              type="button"
              className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
              onClick={() => {
                void handleStaySignedIn();
              }}
              disabled={extending}
            >
              {extending ? (
                <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
              ) : null}
              {t("staySignedIn")}
            </button>
            <button
              type="button"
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              onClick={signOut}
              disabled={extending}
            >
              {t("signOutNow")}
            </button>
          </>
        }
      >
        {t("warningBody", { minutes: sessionWarnMinutes() })}
      </Alert>
    </div>
  );
}
