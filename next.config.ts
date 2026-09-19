import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * P2 hardening (2026-09-19, N-21) — CSP + security headers.
 *
 * `connect-src` must include the real FastAPI backend's origin, not just
 * 'self' — this app and the backend are DIFFERENT origins (confirmed: no
 * frontend code calls Supabase directly, every auth/data call proxies
 * through this app's own `/auth/*`/`REAL_API_BASE` client, so the
 * backend origin is the only third-party connect target that exists).
 * Derived from NEXT_PUBLIC_API_BASE_URL rather than hardcoded, so a
 * different deployment's backend origin doesn't need a code change.
 *
 * Shipped as `Content-Security-Policy-Report-Only` deliberately — this
 * exact stack (UX4G-web-components, Recharts, framer-motion, jsPDF/docx/
 * qrcode) had never been audited against a live CSP in this codebase.
 * That audit (a real browser walkthrough against BOTH `npm run dev` and
 * a real `next build && next start`, 2026-09-19) found a genuine,
 * consistent `'unsafe-eval'` requirement — NOT a guess, and not dev-mode
 * Turbopack noise (confirmed present identically in the production
 * build/start too) — so `'unsafe-eval'` is included below rather than
 * left out and silently breaking real functionality once this policy
 * moves from report-only to enforcing. Flipping to enforcing is still a
 * deliberate follow-up decision (this report-only phase should still run
 * for one real deploy cycle to catch anything this pass didn't exercise
 * — a login/scan/report walkthrough only, not every page/role).
 */
function backendOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return "";
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

function buildCsp(): string {
  const backend = backendOrigin();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js App Router's own hydration/RSC bootstrap script needs
    // 'unsafe-inline' — real nonce-based CSP needs additional middleware
    // wiring this project doesn't have yet (a known, flagged relaxation).
    // 'unsafe-eval': a real, confirmed requirement (see the comment
    // above this function) — some part of this stack evaluates a string
    // as JavaScript at runtime on ordinary page loads, in both dev and a
    // real production build.
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    // Recharts/framer-motion inject inline style attributes at runtime;
    // UX4G-web-components (custom elements) commonly use inline/shadow-
    // DOM styles too.
    "style-src": ["'self'", "'unsafe-inline'"],
    // data: for qrcode/jsPDF's inline-generated content; blob: for
    // client-side generated download/preview URLs (docx/jsPDF).
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(backend ? [backend] : [])],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: buildCsp() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera stays enabled for 'self' — the device-capture wizard
          // needs it; microphone/geolocation have no use case here.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  /**
   * Type errors fail the build. ACCESSIBILITY_AND_QA.md §3 round 4 requires zero
   * TypeScript errors, and a build that quietly ships around them makes that
   * checklist decorative.
   *
   * There is no matching `eslint` key here: Next 16 removed `next lint` and the
   * build-time lint hook with it, so linting is its own gate. `npm run verify` runs
   * both, and that is the command CI should call rather than `next build` alone.
   */
  typescript: { ignoreBuildErrors: false },

  /**
   * No remote image hosts are configured on purpose. BRD §11.7 says this product
   * carries no decorative or stock photography — every image is either a
   * user-scanned product photo served by our own API or a local asset. Scraped
   * e-commerce listing images (page 8) are proxied through the backend rather than
   * hot-linked, so the allowlist stays empty until that endpoint exists.
   */
  images: {
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);
