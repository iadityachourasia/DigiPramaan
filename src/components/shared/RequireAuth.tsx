"use client";

import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/hooks";
import { ROUTES } from "@/lib/constants";

import { LoadingSpinner } from "./LoadingSpinner";

/**
 * RequireAuth — sends unauthenticated visitors to the Login page.
 *
 * NOT A SECURITY BOUNDARY. This is a client-side routing convenience: the
 * session lives in `sessionStorage`, which middleware cannot read, so
 * `src/proxy.ts` stays locale-only. Anyone can still request the underlying
 * route directly. Real protection has to be server-side and depends on the
 * authentication method DoCA settles on (BRD §15 Q-06); until then no
 * authenticated page may render anything that is genuinely sensitive.
 *
 * A cookie mirror was considered and rejected. Without an HttpOnly, signed
 * cookie it is a forgeable "am I logged in" flag, and it introduces a second
 * source of truth that can drift out of step with the real session.
 *
 * The current path is passed through as `?next=` so a deep link survives the
 * round trip through sign-in.
 */

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  useEffect(() => {
    if (loading || session) return;
    const next = encodeURIComponent(pathname);
    router.replace(`${ROUTES.login}?next=${next}`);
  }, [loading, session, pathname, router]);

  /*
   * `loading` is true only on the server render and the hydration pass, so this
   * is a single frame rather than a visible flash. Rendering the shell first
   * and redirecting after would briefly expose the navigation to someone who
   * is not signed in.
   */
  if (loading) {
    return <LoadingSpinner label={t("loading")} variant="page" />;
  }

  /* Redirect is in flight; render nothing rather than a half-state. */
  if (!session) return null;

  return <>{children}</>;
}
