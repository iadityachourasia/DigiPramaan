import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 — `src/lib/api/ecommerce.ts` must branch on `isMockMode()` the
 * same way every other real API client already does (`scans.ts` is the
 * reference pattern this project established): mock mode keeps calling
 * the existing Next.js mock routes, real mode calls the real backend via
 * `API.ecommerce.*`.
 *
 * `isMockMode()`'s underlying flag is read once at module load
 * (`client.ts`'s `USE_MOCK` constant), so each case sets the env var THEN
 * resets the module registry and re-imports — changing `process.env`
 * after import would have no effect on an already-evaluated module.
 */

const originalFetch = global.fetch;
const originalEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATA;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = originalEnv;
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

describe("ecommerce API isMockMode branch", () => {
  it("mock mode calls the Next.js mock route", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, listing: {} }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { scrapeUrl } = await import("@/lib/api/ecommerce");
    await scrapeUrl("https://example.com/product/1", "single");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("/api/ecommerce/scrape");
  });

  it("real mode calls the real backend endpoint", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, listing: {} }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { scrapeUrl } = await import("@/lib/api/ecommerce");
    await scrapeUrl("https://example.com/product/1", "single");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/ecommerce/scrape-preview");
  });

  it("real mode's scanListing sends only the URL and metadata, never the client's own image list", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "scan-1", recordId: "rec-1" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { scanListing } = await import("@/lib/api/ecommerce");
    const listing = {
      id: "listing-1",
      listingUrl: "https://example.com/product/1",
      title: "Widget",
      descriptionExcerpt: "",
      images: [{ id: "img-1", fileName: "a.jpg", url: "https://example.com/a.jpg", sizeBytes: 100, angle: "front" as const }],
      status: "queued" as const,
    };
    const result = await scanListing(
      listing,
      { category: "Packaged Food", region: "Maharashtra" },
      "usr-001"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ scanId: "scan-1", recordId: "rec-1" });
    }
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      url: "https://example.com/product/1",
      category: "Packaged Food",
      region: "Maharashtra",
      manufacturerName: undefined,
    });
    expect(body).not.toHaveProperty("images");
  });
});
