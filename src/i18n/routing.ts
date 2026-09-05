import { defineRouting } from "next-intl/routing";

/**
 * Locale plan — BRD §9.1, resolved via §15 Q-03.
 *
 * ANSWER: English only at launch. Hindi is scaffolded but not offered.
 *
 * What that means concretely:
 *   - `locales` carries both, so `hi` routes resolve and src/messages/hi.json is
 *     type-checked against en.json rather than rotting in a corner.
 *   - `ACTIVE_LOCALES` is what the language switcher renders. It carries `en` alone
 *     until the Hindi translation is complete, so the product never ships a
 *     half-translated screen.
 *   - Promoting Hindi is then a content task: finish hi.json, add "hi" to
 *     NEXT_PUBLIC_ACTIVE_LOCALES. No routing or layout change.
 *
 * Locale routing lives in the URL from day one deliberately. IMPLEMENTATION_GUIDE.md
 * Step 2 calls i18n a from-the-start concern, and the expensive half of retrofitting
 * it is exactly this segment.
 */
export const routing = defineRouting({
  locales: ["en", "hi"],
  defaultLocale: "en",
  /**
   * Keep the prefix off the default locale so English URLs stay clean, which also
   * keeps the demo URLs short.
   */
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/**
 * Locales the language switcher actually offers. Driven by the environment so a
 * deployment can enable Hindi without a code change once its messages are complete.
 */
export const ACTIVE_LOCALES: readonly Locale[] = (
  process.env.NEXT_PUBLIC_ACTIVE_LOCALES ?? "en"
)
  .split(",")
  .map((value) => value.trim())
  .filter((value): value is Locale =>
    (routing.locales as readonly string[]).includes(value)
  );

/** Native-script names, so the switcher never labels a language in English only. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
};
