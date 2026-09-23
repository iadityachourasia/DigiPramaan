import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §AF (2026-09-20) — real-mode branches added to admin.ts, grievances.ts,
 * analytics.ts, manufacturers.ts and reports.ts. Each one must call the
 * real FastAPI backend path (not the Next.js mock route) once
 * NEXT_PUBLIC_USE_MOCK_DATA is "false", the same isMockMode() convention
 * every other real client module already follows (see
 * mobile-handoff-api.test.ts for the reference pattern this file mirrors).
 *
 * isMockMode()'s underlying flag is read once at module load (client.ts's
 * USE_MOCK constant), so each case sets the env var THEN resets the module
 * registry and re-imports.
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("admin.ts real branch", () => {
  it("fetchAdminTeam calls GET /admin/team with no viewerId query param", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({ users: [] });
    }) as unknown as typeof fetch;

    const { fetchAdminTeam } = await import("@/lib/api/admin");
    const result = await fetchAdminTeam("some-viewer-id");

    expect(result).toEqual({ users: [] });
    expect(calls[0]).toContain("/admin/team");
    expect(calls[0]).not.toContain("viewerId");
  });

  it("saveRuleThresholds PUTs the thresholds body directly to /admin/thresholds", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const thresholds = {
      repeatViolationCount: 3,
      repeatViolationDays: 90,
      ocrConfidenceThreshold: 70,
      excellentMinimum: 90,
      goodMinimum: 70,
      poorMinimum: 40,
    };
    let capturedBody: string | undefined;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return jsonResponse(thresholds);
    }) as unknown as typeof fetch;

    const { saveRuleThresholds } = await import("@/lib/api/admin");
    const result = await saveRuleThresholds("actor-1", thresholds);

    expect(result).toEqual(thresholds);
    expect(JSON.parse(capturedBody ?? "{}")).toEqual(thresholds);
  });

  it("deactivateAdminUser throws with the backend's error message on failure", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    global.fetch = vi.fn(async () => jsonResponse({}, 422)) as unknown as typeof fetch;

    const { deactivateAdminUser } = await import("@/lib/api/admin");
    await expect(deactivateAdminUser("actor-1", "user-1")).rejects.toThrow();
  });
});

describe("grievances.ts real branch", () => {
  it("submitGrievance posts real multipart FormData with a File photo, not JSON", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return jsonResponse({ reference: "LM-234567", submittedAt: "2026-09-20T00:00:00Z" });
    }) as unknown as typeof fetch;

    const { submitGrievance } = await import("@/lib/api/grievances");
    const file = new File(["fake-bytes"], "evidence.png", { type: "image/png" });
    const result = await submitGrievance({
      photo: file,
      concerns: ["priceNotShown"],
      website: "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.reference).toBe("LM-234567");
    expect(capturedInit?.body).toBeInstanceOf(FormData);
    const form = capturedInit?.body as FormData;
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(form.get("concerns")).toBe(JSON.stringify(["priceNotShown"]));
  });

  it("lookupGrievance calls GET /grievances/{reference} against the real backend", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({ reference: "LM-234567", status: "Received", lastUpdatedAt: "2026-09-20T00:00:00Z" });
    }) as unknown as typeof fetch;

    const { lookupGrievance } = await import("@/lib/api/grievances");
    const result = await lookupGrievance("LM-234567");

    expect(result.ok).toBe(true);
    expect(calls[0]).toContain("/grievances/LM-234567");
  });

  it("lookupGrievance surfaces a not-found result on 404", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    global.fetch = vi.fn(async () => jsonResponse({ error: { message: "Not found" } }, 404)) as unknown as typeof fetch;

    const { lookupGrievance } = await import("@/lib/api/grievances");
    const result = await lookupGrievance("LM-000000");

    expect(result.ok).toBe(false);
  });
});

describe("analytics.ts real branch", () => {
  it("fetchAnalyticsData calls GET /analytics and returns the backend shape unmodified", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const backendShape = {
      summary: { totalScanned: 10, complianceRatePercentage: 80, processingSuccessRatePercentage: 95 },
      trends: {
        weekly: [{ date: "2026-38", compliant: 4, nonCompliant: 1, totalScans: 5 }],
        monthly: [{ date: "2026-09", compliant: 4, nonCompliant: 1, totalScans: 5 }],
      },
      violationBreakdown: [],
      categoryBreakdown: [],
      regionBreakdown: [],
      sourceBreakdown: [],
      anomalies: [],
    };
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse(backendShape);
    }) as unknown as typeof fetch;

    const { fetchAnalyticsData } = await import("@/lib/api/analytics");
    const result = await fetchAnalyticsData();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(backendShape);
    expect(calls[0]).toContain("/analytics");
  });
});

describe("manufacturers.ts real branch", () => {
  it("flagManufacturerForEnforcement POSTs to /companies/{id}/flag-enforcement", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(init === undefined ? { url } : { url, init });
      return jsonResponse({ flagged: [], skipped: [], alreadyFlagged: [] });
    }) as unknown as typeof fetch;

    const { flagManufacturerForEnforcement } = await import("@/lib/api/manufacturers");
    const result = await flagManufacturerForEnforcement("entity-1", "user-1");

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toContain("/companies/entity-1/flag-enforcement");
    expect(calls[0]?.url).not.toContain("/manufacturers/");
  });
});

describe("reports.ts real branch", () => {
  it("fetchReports calls GET /reports and maps each row through toGeneratedReport", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false";
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({
        reports: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            complianceRecordId: "22222222-2222-2222-2222-222222222222",
            referenceCode: "RC-0001",
            generatedAt: "2026-09-20T00:00:00Z",
            generatedBy: null,
            status: "COMPLETED",
            currentStage: null,
            errorMessage: null,
            reportFormatVersion: "1",
            formats: ["pdf"],
          },
        ],
        total: 1,
      });
    }) as unknown as typeof fetch;

    const { fetchReports } = await import("@/lib/api/reports");
    const result = await fetchReports();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.total).toBe(1);
      expect(result.data.reports[0]?.referenceCode).toBe("RC-0001");
      expect(result.data.reports[0]?.scope).toEqual({
        kind: "record",
        recordId: "22222222-2222-2222-2222-222222222222",
      });
    }
    expect(calls[0]).toContain("/reports");
    expect(calls[0]).not.toContain("/api/reports");
  });
});
