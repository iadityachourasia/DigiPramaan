import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Per-request locale resolution. An unknown locale segment falls back to English
 * rather than throwing, so a stale or hand-typed URL still renders a usable page.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    /**
     * Asia/Kolkata is fixed rather than inferred. Every timestamp in this product is
     * an inspection or verification time in India, and rendering an officer's own
     * action in the viewer's local zone would be actively misleading in an audit
     * trail.
     */
    timeZone: "Asia/Kolkata",
  };
});
