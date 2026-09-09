import { beforeEach, describe, expect, it } from "vitest";

import { listActivity, resetAuditStoreForTests } from "@/lib/server/audit-store";
import {
  computeAnalyticsSummary,
  computeManufacturerScorecard,
  createPipelineRun,
  completePipelineRunNow,
  listRecords,
  reassignCase,
  resolveManufacturerScorecardForViewer,
  resetPipelineStoreForTests,
} from "@/lib/server/scan-pipeline-store";
import { MOCK_ACTIVE_RECORDS } from "@/lib/mock/records";
import { MOCK_MANUFACTURERS, type MockManufacturer } from "@/lib/mock/reference";
import {
  completeReportRunNowForTests,
  createReportRun,
  resolveScopeRecords,
} from "@/lib/server/report-store";
import { GET as getRecordRoute } from "@/app/api/records/[id]/route";
import { GET as getManufacturerRoute } from "@/app/api/manufacturers/[id]/scorecard/route";
import { POST as reportScopeRoute } from "@/app/api/reports/scope/route";
import { GET as getReportRoute } from "@/app/api/reports/[id]/route";
import { GET as downloadReportRoute } from "@/app/api/reports/[id]/download/[format]/route";
import type { RecordFilters } from "@/types";

/**
 * Jurisdiction scoping (13 §4). The seed set's own shape does the heavy
 * lifting here rather than fixtures built for the test: Maharashtra has
 * exactly two active seed records (`rec-1001`, `rec-1011`), both scanned by
 * `usr-001`, and nothing else does — a state narrower than "everything" and
 * wider than "nothing" is the most useful state to assert against.
 */

const NO_FILTERS: RecordFilters = {
  categories: [],
  complianceStatuses: [],
  regions: [],
  manufacturers: [],
  sources: [],
  violationCategoryIds: [],
  batchIds: [],
};

const UNSCOPED_ACTIVE_COUNT = MOCK_ACTIVE_RECORDS.length;

describe("jurisdiction scoping", () => {
  beforeEach(() => {
    resetPipelineStoreForTests();
    resetAuditStoreForTests();
  });

  describe("National jurisdiction — backward compatibility", () => {
    it("no viewer at all returns every active record, exactly as before this feature existed", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100);
      expect(page.totalCount).toBe(UNSCOPED_ACTIVE_COUNT);
    });

    it("a National Admin (usr-002) sees exactly what an unscoped read sees", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-002");
      expect(page.totalCount).toBe(UNSCOPED_ACTIVE_COUNT);
    });

    it("a Reviewer (usr-003) is unscoped — §4.2 states no jurisdiction rule for Reviewer", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-003");
      expect(page.totalCount).toBe(UNSCOPED_ACTIVE_COUNT);
    });

    it("an unresolvable viewerId fails open to unscoped, not empty", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "no-such-user");
      expect(page.totalCount).toBe(UNSCOPED_ACTIVE_COUNT);
    });

    it("keeps National Admin and Reviewer report scopes unfiltered while preserving Rohan's existing own-cases rule", () => {
      const scope = { kind: "filtered" as const, filters: NO_FILTERS };
      expect(resolveScopeRecords(scope, "usr-002")).toHaveLength(UNSCOPED_ACTIVE_COUNT);
      expect(resolveScopeRecords(scope, "usr-003")).toHaveLength(UNSCOPED_ACTIVE_COUNT);
      expect(resolveScopeRecords(scope, "usr-001")).toHaveLength(7);
    });
  });

  describe("State jurisdiction — genuine narrowing", () => {
    it("a Maharashtra Admin (usr-004) sees only Maharashtra's two active seed records", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-004");
      expect(page.totalCount).toBe(2);
      expect(page.rows.every((r) => r.region === "Maharashtra")).toBe(true);
      expect(page.rows.map((r) => r.id).sort()).toEqual(["rec-1001", "rec-1011"]);
    });

    it("scopes Analytics' totals the same way Records' list is scoped", () => {
      const aggregate = computeAnalyticsSummary("usr-004");
      expect(aggregate.summary.totalScanned).toBe(2);
    });

    it("narrows a manufacturer scorecard to only the visible products", () => {
      const unscoped = computeManufacturerScorecard("mfr-002"); // Ganga Beverages Ltd: 3 seeds, none in Maharashtra
      expect(unscoped?.summary.totalProductsScanned).toBe(3);

      const scoped = computeManufacturerScorecard("mfr-002", "usr-004");
      expect(scoped?.summary.totalProductsScanned).toBe(0);
      expect(scoped?.products).toEqual([]);
    });

    it("keeps every Deccan scorecard aggregate internally scoped for Priya", () => {
      const scorecard = resolveManufacturerScorecardForViewer("mfr-004", "usr-004").scorecard;
      expect(scorecard?.products).toHaveLength(1);
      expect(scorecard?.products[0]?.region).toBe("Maharashtra");
      expect(scorecard?.summary.totalProductsScanned).toBe(1);
      const visible = scorecard?.products ?? [];
      const verified = visible.filter((record) => record.verificationStatus === "Verified");
      const compliant = verified.filter((record) => record.complianceStatus === "Compliant");
      const expectedRate = verified.length === 0 ? 0 : Math.round((compliant.length / verified.length) * 100);
      expect(scorecard?.summary.complianceRatePercentage).toBe(expectedRate);
      expect(scorecard?.violationBreakdown.reduce((count, entry) => count + entry.count, 0)).toBe(
        visible[0]?.violations.length
      );
      expect(scorecard?.complianceTrend.every((point, index) => point.sampleSize === index + 1)).toBe(true);
      expect(scorecard?.recentNonCompliantCount).toBe(
        visible.filter((record) => record.complianceStatus === "Non-Compliant").length
      );
    });

    it("blocks a known manufacturer whose records are wholly outside Priya's scope", async () => {
      const response = await getManufacturerRoute(
        new Request("http://localhost/api/manufacturers/mfr-002/scorecard?viewerId=usr-004"),
        { params: Promise.resolve({ id: "mfr-002" }) }
      );
      expect(response.status).toBe(403);
    });

    it("keeps a directory manufacturer with no records anywhere as a valid empty scorecard", () => {
      const directory = MOCK_MANUFACTURERS as MockManufacturer[];
      directory.push({ id: "mfr-zero-test", name: "Zero Record Test Manufacturer" });
      try {
        const result = resolveManufacturerScorecardForViewer("mfr-zero-test", "usr-004");
        expect(result.blocked).toBe(false);
        expect(result.scorecard?.summary.totalProductsScanned).toBe(0);
        expect(result.scorecard?.products).toEqual([]);
      } finally {
        directory.pop();
      }
    });

    it("returns the same blocked direct-record response for a non-Maharashtra record", async () => {
      const response = await getRecordRoute(
        new Request("http://localhost/api/records/rec-1002?viewerId=usr-004"),
        { params: Promise.resolve({ id: "rec-1002" }) }
      );
      expect(response.status).toBe(403);
    });

    it("narrows report count, generation, detail, and download to Priya's records", async () => {
      const scope = { kind: "filtered" as const, filters: NO_FILTERS };
      const scoped = resolveScopeRecords(scope, "usr-004");
      expect(scoped).toHaveLength(2);
      expect(scoped.every((record) => record.region === "Maharashtra")).toBe(true);

      const scopeResponse = await reportScopeRoute(
        new Request("http://localhost/api/reports/scope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, viewerId: "usr-004" }),
        })
      );
      expect((await scopeResponse.json()).rowCount).toBe(2);

      const run = createReportRun({
        scope,
        formats: ["PDF"],
        generatedByUserId: "usr-004",
        generatedByUserName: "Priya Kulkarni",
        viewerId: "usr-004",
      });
      expect(run.rowCount).toBe(2);
      const runId = run.run?.id;
      expect(runId).toBeDefined();

      // Generation is time-elapsed based (600 + 1100 + 400ms of simulated
      // stages) — force it straight to finalising so the report she just
      // generated actually exists to query, the same way the running app
      // would once a real poll had waited that out.
      const completed = completeReportRunNowForTests(runId!);
      const reportId = completed?.report?.id;
      expect(reportId).toBeDefined();

      const detailResponse = await getReportRoute(
        new Request(`http://localhost/api/reports/${reportId}?viewerId=usr-004`),
        { params: Promise.resolve({ id: reportId! }) }
      );
      const detail = (await detailResponse.json()) as { report: { rowCount: number }; document: { records: Array<{ region: string }> } };
      expect(detail.report.rowCount).toBe(detail.document.records.length);
      expect(detail.document.records.every((record) => record.region === "Maharashtra")).toBe(true);

      const downloadResponse = await downloadReportRoute(
        new Request(`http://localhost/api/reports/${reportId}/download/pdf?viewerId=usr-004`),
        { params: Promise.resolve({ id: reportId!, format: "pdf" }) }
      );
      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.headers.get("Content-Type")).toBe("application/pdf");
    });

    it("blocks Priya from a report she did not generate and shares no jurisdiction with", async () => {
      // rpt-5003 was generated by usr-002 (National) and covers Uttar
      // Pradesh, Telangana, Delhi and Bihar records only — none of which
      // Priya's Maharashtra scope can see, and she did not generate it.
      const detailResponse = await getReportRoute(
        new Request("http://localhost/api/reports/rpt-5003?viewerId=usr-004"),
        { params: Promise.resolve({ id: "rpt-5003" }) }
      );
      expect(detailResponse.status).toBe(403);

      const downloadResponse = await downloadReportRoute(
        new Request("http://localhost/api/reports/rpt-5003/download/pdf?viewerId=usr-004"),
        { params: Promise.resolve({ id: "rpt-5003", format: "pdf" }) }
      );
      expect(downloadResponse.status).toBe(403);
    });
  });

  describe("Enforcement Officer own-cases rule — applies regardless of jurisdiction level", () => {
    it("usr-001 (National jurisdiction) sees only the 7 seed records assigned to them, not all 11", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-001");
      expect(page.totalCount).toBe(7);
      expect(page.rows.every((r) => r.assignedOfficerUserId === "usr-001")).toBe(true);
    });

    it("applies the same direct-detail restrictions to Vikram", async () => {
      const recordResponse = await getRecordRoute(
        new Request("http://localhost/api/records/rec-1001?viewerId=usr-005"),
        { params: Promise.resolve({ id: "rec-1001" }) }
      );
      const manufacturerResponse = await getManufacturerRoute(
        new Request("http://localhost/api/manufacturers/mfr-004/scorecard?viewerId=usr-005"),
        { params: Promise.resolve({ id: "mfr-004" }) }
      );
      expect(recordResponse.status).toBe(403);
      expect(manufacturerResponse.status).toBe(403);
    });

    it("narrows Vikram's report scope to his own cases and blocks an empty generation", () => {
      const scope = { kind: "filtered" as const, filters: NO_FILTERS };
      expect(resolveScopeRecords(scope, "usr-005")).toEqual([]);
      const result = createReportRun({
        scope,
        formats: ["PDF"],
        generatedByUserId: "usr-005",
        generatedByUserName: "Vikram Jadhav",
        viewerId: "usr-005",
      });
      expect(result).toEqual({ blocked: "zero-records", rowCount: 0 });
    });

    it("usr-005 (State jurisdiction, zero seed cases) starts with an honest empty result, not a broken one", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-005");
      expect(page.totalCount).toBe(0);
    });

    it("usr-005 sees exactly their own case once they scan something live, and nothing else in their state", () => {
      createPipelineRun({
        scanId: "SCAN-JURIS-TEST-1",
        scannedByUserId: "usr-005",
        metadata: { category: "Beverages", region: "Maharashtra" },
        images: [],
      });
      completePipelineRunNow("SCAN-JURIS-TEST-1");

      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-005");
      expect(page.totalCount).toBe(1);
      expect(page.rows[0]?.assignedOfficerUserId).toBe("usr-005");

      /* Their Admin (usr-004, same state) sees it too, alongside the two
       * seeds — jurisdiction, not ownership, governs an Admin's view. */
      const adminPage = listRecords(NO_FILTERS, "newest", 1, 100, "usr-004");
      expect(adminPage.totalCount).toBe(3);
    });
  });

  describe("reassignCase", () => {
    it("moves a case to a new officer and makes it visible in their own-cases scope", () => {
      createPipelineRun({
        scanId: "SCAN-REASSIGN-TEST-1",
        scannedByUserId: "usr-001",
        metadata: { category: "Beverages", region: "Maharashtra" },
        images: [],
      });
      completePipelineRunNow("SCAN-REASSIGN-TEST-1");
      const recordId = "rec-SCAN-REASSIGN-TEST-1";

      const before = listRecords(NO_FILTERS, "newest", 1, 100, "usr-005");
      expect(before.totalCount).toBe(0);

      const reassigned = reassignCase(recordId, "usr-005", "usr-004");
      expect(reassigned?.assignedOfficerUserId).toBe("usr-005");

      const afterOldOfficer = listRecords(NO_FILTERS, "newest", 1, 100, "usr-001");
      expect(afterOldOfficer.rows.some((r) => r.id === recordId)).toBe(false);

      const afterNewOfficer = listRecords(NO_FILTERS, "newest", 1, 100, "usr-005");
      expect(afterNewOfficer.totalCount).toBe(1);
      expect(afterNewOfficer.rows[0]?.id).toBe(recordId);
    });

    it("refuses when the reassigning user is not an Admin", () => {
      createPipelineRun({
        scanId: "SCAN-REASSIGN-TEST-2",
        scannedByUserId: "usr-001",
        metadata: { category: "Beverages", region: "Maharashtra" },
        images: [],
      });
      completePipelineRunNow("SCAN-REASSIGN-TEST-2");

      const result = reassignCase("rec-SCAN-REASSIGN-TEST-2", "usr-005", "usr-001");
      expect(result).toBeUndefined();
    });

    it("refuses when the target is not an Enforcement Officer", () => {
      createPipelineRun({
        scanId: "SCAN-REASSIGN-TEST-3",
        scannedByUserId: "usr-001",
        metadata: { category: "Beverages", region: "Maharashtra" },
        images: [],
      });
      completePipelineRunNow("SCAN-REASSIGN-TEST-3");

      const result = reassignCase("rec-SCAN-REASSIGN-TEST-3", "usr-002", "usr-004");
      expect(result).toBeUndefined();
    });

    it("refuses when the reassigning Admin's jurisdiction does not cover the case's region", () => {
      createPipelineRun({
        scanId: "SCAN-REASSIGN-TEST-4",
        scannedByUserId: "usr-001",
        metadata: { category: "Beverages", region: "Delhi" },
        images: [],
      });
      completePipelineRunNow("SCAN-REASSIGN-TEST-4");

      /* usr-004 is scoped to Maharashtra; this case is in Delhi. */
      const result = reassignCase("rec-SCAN-REASSIGN-TEST-4", "usr-005", "usr-004");
      expect(result).toBeUndefined();
    });

    it("emits a case_reassigned activity event naming the outgoing and incoming officer", () => {
      createPipelineRun({
        scanId: "SCAN-REASSIGN-TEST-5",
        scannedByUserId: "usr-001",
        metadata: { category: "Beverages", region: "Maharashtra" },
        images: [],
      });
      completePipelineRunNow("SCAN-REASSIGN-TEST-5");
      reassignCase("rec-SCAN-REASSIGN-TEST-5", "usr-005", "usr-004");

      const page = listActivity(
        {
          actorUserIds: [],
          types: ["case_reassigned"],
          regions: [],
          recordId: "rec-SCAN-REASSIGN-TEST-5",
        },
        "newest",
        1,
        20
      );
      expect(page.totalCount).toBe(1);
      expect(page.rows[0]?.detail).toContain("Rohan Deshmukh");
      expect(page.rows[0]?.detail).toContain("Vikram Jadhav");
    });
  });
});
