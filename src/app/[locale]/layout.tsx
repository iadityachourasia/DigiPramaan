import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";

import "../globals.css";

/**
 * PHASE 1 SCOPE NOTE.
 *
 * This layout wires the document, the locale provider and the stylesheet, and
 * nothing else. The Navbar, Footer, Accessibility Bar, Sidebar and Breadcrumb are
 * Phase 2 work per IMPLEMENTATION_GUIDE.md's build order, and per
 * Pages_Userflow/00-README.md the authenticated shell is built with the Dashboard,
 * which is the second page in the page build order. Nothing shell-shaped belongs
 * here yet.
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
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
