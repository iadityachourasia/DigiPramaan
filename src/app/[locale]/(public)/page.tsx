import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import {
  HomeCapabilities,
  HomeCitizens,
  HomeFinalCta,
  HomeHero,
  HomePipeline,
  HomeServices,
  HomeStats,
  HomeTaxonomy,
  HomeValueStrip,
} from "@/components/sections/home";

/**
 * Landing page — the public front door.
 *
 * Composed against PAGE_COMPOSITION.md §1's zone table. Section rhythm is held
 * constant and declared in markup through the `lmcs-section*` classes:
 *
 *   Hero          Section/XL   elevated
 *   Value strip   (no section background of its own — see HomeValueStrip.tsx)
 *   Services      Section/L    default
 *   Capabilities  Section/L    elevated
 *   Pipeline      Section/L    default
 *   Stats         Section/L    elevated
 *   Taxonomy      Section/XL   default
 *   Citizens      Section/XL   elevated
 *   Final CTA     Section/L    default
 *
 * Backgrounds alternate Default and Elevated — never Soft, which collides with
 * Subtle in dark mode (DESIGN_SYSTEM.md §7). Capabilities/Final CTA are new
 * (UI polish pass); Pipeline/Stats/Taxonomy/Citizens each swapped their
 * background one step to keep the chain alternating once Capabilities was
 * inserted after Services.
 *
 * PublicMasthead selects the full navigation only for this route. Login keeps
 * its compact identity row; every public route keeps the government utility strip.
 *
 * NOTE (BRD §6.1): the sitemap in the BRD places Login at `/`. This page now
 * occupies that path and Login sits at `/login`. §6.1 and §6.2 need updating to
 * match.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <main id="main-content" tabIndex={-1}>
        <HomeHero />
        <HomeValueStrip />
        <HomeServices />
        <HomeCapabilities />
        <HomePipeline />
        <HomeStats />
        <HomeTaxonomy />
        <HomeCitizens />
        <HomeFinalCta />
      </main>
    </>
  );
}
