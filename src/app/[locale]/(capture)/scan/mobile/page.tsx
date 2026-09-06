import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { MobileCodeEntryForm } from "@/components/scan/MobileCodeEntryForm";

/**
 * Mobile Capture Companion — code entry (03-scan-upload.md §2).
 * Landed on directly when an officer types the plain-text fallback code
 * rather than scanning the QR (which goes straight to /scan/mobile/[token]).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: `Continue on mobile | ${t("defaultTitle")}` };
}

export default async function MobileCodeEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("scan.mobileCompanion");

  return (
    <main id="main-content" className="lmcs-capture-main">
      <MobileCodeEntryForm
        labels={{
          heading: t("codeEntryHeading"),
          body: t("codeEntryBody"),
          codeLabel: t("codeEntryLabel"),
          submit: t("codeEntrySubmit"),
        }}
      />
    </main>
  );
}
