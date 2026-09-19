import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

const localeMiddleware = createMiddleware(routing);

/**
 * Locale negotiation and redirects, plus (§T step 1.9) a production lockdown
 * of the mock API namespace.
 *
 * This file is named proxy.ts, not middleware.ts. Next 16 deprecated the middleware
 * file convention in favour of this one and warns on every build otherwise.
 *
 * `src/app/api/**` is a mock backend over in-memory TypeScript stores (F-002):
 * it trusts caller-supplied identity fields in request bodies and must never be
 * reachable in a real deployment. Local dev and Playwright set
 * ENABLE_MOCK_API=true (see .env.example, playwright.config.ts) to keep using it;
 * everywhere else it 404s before the route handler ever runs — one choke point
 * instead of a guard in each of the ~40 handlers.
 *
 * `/api/internal/**` is the one deliberate exception (F-003's report-render
 * bridge, `src/app/api/internal/render-report/route.ts`): it was never mock
 * data, it's real service-to-service infrastructure with its own trust
 * boundary (a shared secret the route itself checks), so the ENABLE_MOCK_API
 * gate is the wrong control for it — it passes straight through here.
 */
export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/internal/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    if (process.env.ENABLE_MOCK_API !== "true") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found" } },
        { status: 404 },
      );
    }
    return NextResponse.next();
  }
  return localeMiddleware(request);
}

export const config = {
  matcher: [
    /**
     * Every path except Next internals, the API namespace, and anything carrying a
     * file extension. Without the extension exclusion, static assets would get
     * locale-prefixed.
     */
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // The mock API namespace itself — routed to the lockdown check above,
    // never to next-intl's own handler.
    "/api/:path*",
  ],
};
