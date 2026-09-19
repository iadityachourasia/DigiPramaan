import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRecordReportDownloadHref, reportDownloadHref } from "@/lib/api/reports";
import type { GeneratedReport } from "@/types";

/**
 * P2 hardening (F-010) — getRecordReportDownloadHref replaces the raw
 * session token in a report-download URL with a short-lived signed
 * ticket, issued via a real Bearer-authenticated POST first. Confirms
 * the ticket flow is actually taken for a real-backend record-scope
 * report, that the URL carries `?ticket=` (never `?access_token=`), and
 * that mock-scope reports are unaffected.
 */

const REAL_REPORT: GeneratedReport = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Report",
  scope: { kind: "record", recordId: "22222222-2222-2222-2222-222222222222" },
  formats: ["PDF"],
  generatedAt: new Date().toISOString(),
  generatedByUserId: "usr-001",
  generatedByUserName: "Test Officer",
  referenceCode: "LM-000001",
  rowCount: 1,
  recordIds: ["22222222-2222-2222-2222-222222222222"],
};

describe("getRecordReportDownloadHref", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ticket: "dp1dl-fake-ticket", expiresAt: "2026-09-19T00:00:00Z" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues a ticket and returns a URL carrying ?ticket=, never ?access_token=", async () => {
    const href = await getRecordReportDownloadHref(REAL_REPORT, "PDF");
    expect(href).toContain("ticket=dp1dl-fake-ticket");
    expect(href).not.toContain("access_token=");
  });

  it("calls the download-ticket issuance endpoint, not the download endpoint itself", async () => {
    await getRecordReportDownloadHref(REAL_REPORT, "PDF");
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(`/reports/${REAL_REPORT.id}/download-ticket`);
    expect(init.method).toBe("POST");
  });

  it("falls back to the token-in-URL href if ticket issuance fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );
    const href = await getRecordReportDownloadHref(REAL_REPORT, "PDF");
    // Falls back to reportDownloadHref's own (still functional) shape.
    expect(href).toBe(reportDownloadHref(REAL_REPORT, "PDF"));
  });

  it("mock-scope reports never call the ticket endpoint at all", async () => {
    const mockReport: GeneratedReport = {
      ...REAL_REPORT,
      id: "rpt-5001",
      scope: { kind: "manufacturer", manufacturerId: "mfr-1" },
    };
    const href = await getRecordReportDownloadHref(mockReport, "PDF");
    expect(fetch).not.toHaveBeenCalled();
    expect(href).toBe(reportDownloadHref(mockReport, "PDF"));
  });
});
