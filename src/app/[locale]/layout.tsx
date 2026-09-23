import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { DISPLAY_SIZE_STORAGE_KEY } from "@/lib/display-size-constants";
import { THEME_STORAGE_KEY } from "@/lib/theme-constants";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeRuntime } from "@/providers/ThemeRuntime";
import { UX4GRuntime } from "@/providers/UX4GRuntime";

import "../globals.css";

const themeInitScript = `try {
  const stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = stored === "light" || stored === "dark"
    ? stored : systemDark ? "dark" : "light";
  const displaySize = localStorage.getItem(${JSON.stringify(DISPLAY_SIZE_STORAGE_KEY)});
  if (displaySize === "large" || displaySize === "larger") {
    document.documentElement.dataset.displaySize = displaySize;
  }
} catch {
  document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";
}`;

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
    manifest: "/manifest.json",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon0.svg", type: "image/svg+xml" },
        { url: "/icon1.png", type: "image/png" },
      ],
      apple: [{ url: "/apple-icon.png", type: "image/png" }],
    },
    appleWebApp: {
      title: "DigiPramaan",
    },
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
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Apply the saved or system theme before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <ThemeRuntime />
          <UX4GRuntime />
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
