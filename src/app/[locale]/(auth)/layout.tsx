import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/shared/RequireAuth";

/**
 * Authenticated layout — the app shell, behind a sign-in check.
 *
 * A Server Component. `AuthProvider` now lives in `[locale]/layout.tsx` so it
 * also covers the `(public)` group, where the login form needs it; the mobile
 * drawer's state lives in `AppShell`. That leaves nothing here that requires a
 * client boundary, which is what lets this file stay `async` and call
 * `setRequestLocale`.
 *
 * `RequireAuth` is a routing convenience, not a security boundary — see its
 * own documentation.
 */

interface AuthLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AuthLayout({
  children,
  params,
}: AuthLayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
