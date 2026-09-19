/**
 * proxy.ts — §T step 1.9's runtime lockdown of the mock API namespace.
 * Constructs real NextRequest objects and calls the exported handler
 * directly; no server needed.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import proxy from "@/proxy";

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy — mock API lockdown", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("404s an /api/* route when ENABLE_MOCK_API is unset", async () => {
    vi.stubEnv("ENABLE_MOCK_API", "");
    const response = proxy(requestFor("/api/activity"));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("404s an /api/* route when ENABLE_MOCK_API is any value other than \"true\"", async () => {
    vi.stubEnv("ENABLE_MOCK_API", "1");
    const response = proxy(requestFor("/api/admin/team"));
    expect(response.status).toBe(404);
  });

  it("passes an /api/* route through when ENABLE_MOCK_API=true", () => {
    vi.stubEnv("ENABLE_MOCK_API", "true");
    const response = proxy(requestFor("/api/activity"));
    expect(response.status).not.toBe(404);
  });

  it("never intercepts a non-api path, regardless of ENABLE_MOCK_API", () => {
    vi.stubEnv("ENABLE_MOCK_API", "");
    const response = proxy(requestFor("/en/dashboard"));
    // next-intl's own middleware handles this — the important property here
    // is just that it's NOT our 404 response.
    expect(response.status).not.toBe(404);
  });
});
