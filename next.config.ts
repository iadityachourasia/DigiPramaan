import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * §T step 1.9 build-time half of the mock-API lockdown (the runtime half is
 * src/proxy.ts). A production build must never ship with the mock namespace
 * reachable or the client defaulting to mock data — fail the build outright
 * rather than silently deploying either.
 */
if (
  process.env.VERCEL_ENV === "production" &&
  (process.env.ENABLE_MOCK_API === "true" || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false")
) {
  throw new Error(
    "Refusing to build for production with mock mode enabled — " +
      "ENABLE_MOCK_API must be unset (or \"false\") and NEXT_PUBLIC_USE_MOCK_DATA must be " +
      '"false". See src/proxy.ts and F-002 in docs/internal/BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md.',
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
