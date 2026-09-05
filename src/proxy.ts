import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Locale negotiation and redirects.
 *
 * This file is named proxy.ts, not middleware.ts. Next 16 deprecated the middleware
 * file convention in favour of this one and warns on every build otherwise. The
 * handler itself is unchanged: next-intl's createMiddleware returns a plain request
 * handler, and Next picks it up by file name.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Every path except Next internals, the API namespace, and anything carrying a
   * file extension. Without the extension exclusion, static assets would get
   * locale-prefixed.
   */
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
