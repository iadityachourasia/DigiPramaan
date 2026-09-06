import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { MobileCaptureView } from "@/components/scan/MobileCaptureView";

/**
 * Mobile Capture Companion — the page a phone lands on after scanning the QR
 * (03-scan-upload.md §2). Camera-first, no sidebar/header shell (see the
 * (capture) route group's layout).
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

export default async function MobileCapturePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="lmcs-capture-main">
      <MobileCaptureView token={token} />
    </main>
  );
}
