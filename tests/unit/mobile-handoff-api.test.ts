import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 10 — src/lib/api/scans.ts's mobile-handoff functions must branch
 * on isMockMode() like every other real API client (scans.ts's own
 * createScan/fetchScan are the reference pattern), and createScan()'s
 * real branch must send real multipart file fields, not a JSON-encoded
 * description of files (the pre-existing bug this phase also fixes).
 *
 * isMockMode()'s underlying flag is read once at module load
 * (client.ts's USE_MOCK constant), so each case sets the env var THEN
 * resets the module registry and re-imports.
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

describe("createScan real-mode multipart contract", () => {
  it("sends real file blobs as front/back/side_pdp fields, never a JSON images blob", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";

    const capturedFormData: FormData[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("blob:")) {
        // Re-fetching a captured slot's object URL back into a Blob.
        return new Response(new Blob(["fake-image-bytes"], { type: "image/jpeg" }));
      }
      if (init?.body instanceof FormData) {
        capturedFormData.push(init.body);
      }
      return new Response(JSON.stringify({ id: "scan-1", recordId: "rec-1", status: "Processing", createdAt: "" }), {
        status: 201,
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createScan } = await import("@/lib/api/scans");
    const result = await createScan({
      metadata: { category: "Packaged Food", region: "Maharashtra" },
      images: [
        { angle: "front", fileName: "front.jpg", url: "blob:front-url", sizeBytes: 100 },
        { angle: "back", fileName: "back.jpg", url: "blob:back-url", sizeBytes: 100 },
        { angle: "side_pdp", fileName: "side.jpg", url: "blob:side-url", sizeBytes: 100 },
      ],
      scannedByUserId: "usr-001",
    });

    expect(result.ok).toBe(true);
    expect(capturedFormData).toHaveLength(1);
    const [formData] = capturedFormData;
    if (!formData) throw new Error("expected a captured FormData");

    // The bug this fixes: `images` must NOT be a JSON string describing
    // files — each angle must be its own real file field.
    expect(formData.get("images")).toBeNull();
    for (const angle of ["front", "back", "side_pdp"]) {
      const entry = formData.get(angle);
      expect(entry).toBeInstanceOf(Blob);
      expect((entry as File).name).toMatch(/\.jpg$/);
    }
    expect(formData.get("metadata")).toBeTruthy();
  });
});

describe("mobile-handoff isMockMode branch", () => {
  it("mock mode calls the local Next.js mock route", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "t", scanDraftId: "d", status: "waiting", createdAt: "", expiresAt: "", capturedAngles: [], capturedImages: {} }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createMobileSession } = await import("@/lib/api/scans");
    await createMobileSession("SCAN-DRAFT-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("/api/mobile-sessions");
  });

  it("real mode calls the real backend handoff-creation endpoint and maps the response", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handoffId: "h1",
        scanId: "real-scan-id",
        mobileUrl: "https://example.com/mobile-capture/RAW_TOKEN_VALUE",
        expiresAt: "2026-01-01T00:15:00Z",
        status: "ACTIVE",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createMobileSession } = await import("@/lib/api/scans");
    const result = await createMobileSession("SCAN-DRAFT-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/scans/mobile-handoff");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.token).toBe("RAW_TOKEN_VALUE");
      // Real mode's scanDraftId carries the REAL backend scan id.
      expect(result.data.scanDraftId).toBe("real-scan-id");
      expect(result.data.capturedImages).toEqual({});
    }
  });

  it("real mode's image upload sends a real multipart file, not JSON/data-url", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ passed: true, failureReason: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { uploadMobileCaptureImage } = await import("@/lib/api/scans");
    const file = new File(["bytes"], "front.jpg", { type: "image/jpeg" });
    const result = await uploadMobileCaptureImage("raw-token", "front", file);

    expect(result.ok).toBe(true);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/mobile-handoff/raw-token/images/front");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });
});
