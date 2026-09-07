import { beforeEach, describe, expect, it } from "vitest";

import { listActivity, resetAuditStoreForTests } from "@/lib/server/audit-store";
import {
  computeAnalyticsSummary,
  computeManufacturerScorecard,
  createPipelineRun,
  completePipelineRunNow,
  listRecords,
  reassignCase,
  resetPipelineStoreForTests,
} from "@/lib/server/scan-pipeline-store";
import { MOCK_ACTIVE_RECORDS } from "@/lib/mock/records";
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
  });

  describe("Enforcement Officer own-cases rule — applies regardless of jurisdiction level", () => {
    it("usr-001 (National jurisdiction) sees only the 7 seed records assigned to them, not all 11", () => {
      const page = listRecords(NO_FILTERS, "newest", 1, 100, "usr-001");
      expect(page.totalCount).toBe(7);
      expect(page.rows.every((r) => r.assignedOfficerUserId === "usr-001")).toBe(true);
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
