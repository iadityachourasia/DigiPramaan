import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { AuthProvider } from "@/providers/AuthProvider";
import { UX4GRuntime } from "@/providers/UX4GRuntime";

import "../globals.css";

/**
 * Root layout for the locale segment: the document, the providers and the
 * stylesheet. No visual chrome — the public shell lives in `(public)/layout.tsx`
 * and the authenticated shell in `(auth)/layout.tsx`.
 *
 * WHY `AuthProvider` IS HERE AND NOT IN `(auth)`
 * ----------------------------------------------
 * The Login page sits in the `(public)` group and needs `signIn`. A provider
 * mounted only in `(auth)` would leave it outside the context, and `useAuth()`
 * throws on a null context — so the form would crash on submit. Mounting it
 * here wraps both route groups.
 *
 * This layout stays a Server Component. It renders client providers as
 * children, which is a boundary, not a conversion: every page below remains a
 * Server Component unless it opts in itself.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("defaultTitle"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  /* Opts this segment into static rendering for the locale. */
  setRequestLocale(locale);

  return (
    /**
     * `lang` is set from the active locale, which WCAG 3.1.1 requires and which also
     * lets UX4G pick the right script face for Devanagari once Hindi is enabled.
     *
     * `data-theme` is deliberately absent. The package's dark theme is opt-in through
     * this attribute and BRD §11.3 marks dark mode out of scope for the MVP, so the
     * document stays on the light theme until that decision changes. The QA sweep
     * sets the attribute itself so dark mode is still verified.
     */
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <UX4GRuntime />
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
