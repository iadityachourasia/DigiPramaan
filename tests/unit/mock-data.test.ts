import { describe, expect, it } from "vitest";

import {
  MOCK_ACTIVE_RECORDS,
  MOCK_KPIS,
  MOCK_RECORDS,
  MOCK_SCORECARDS,
} from "@/lib/mock";
import {
  COMPLIANCE_STATUSES,
  computeComplianceStatus,
  REPEAT_VIOLATION_THRESHOLD,
  SOURCE_TAGS,
  VERIFICATION_STATUSES,
  violationCategory,
} from "@/types";

/**
 * Mock data that disagrees with the rules it is meant to illustrate is worse than no
 * mock data: it teaches the wrong shape and a judge can catch it by clicking a KPI.
 * These assertions keep the fixtures honest.
 */

describe("mock records", () => {
  it("never carries a status its own checklist contradicts", () => {
    for (const record of MOCK_RECORDS) {
      expect(record.complianceStatus).toBe(
        computeComplianceStatus({
          verificationStatus: record.verificationStatus,
          needsReviewFlag: record.needsReviewFlag,
          checklist: record.checklist,
        })
      );
    }
  });

  it("raises exactly one violation per failed checklist line", () => {
    for (const record of MOCK_RECORDS) {
      const failed = record.checklist.filter((line) => !line.passed);
      expect(record.violations).toHaveLength(failed.length);
    }
  });

  it("uses taxonomy wording verbatim in every violation", () => {
    for (const record of MOCK_RECORDS) {
      for (const violation of record.violations) {
        const definition = violationCategory(violation.categoryId);
        expect(violation.category).toBe(definition.category);
        expect(violation.legalBasis).toBe(definition.legalBasis);
      }
    }
  });

  it("covers every Compliance Status, Verification Status and source tag", () => {
    for (const status of COMPLIANCE_STATUSES) {
      expect(
        MOCK_ACTIVE_RECORDS.some((r) => r.complianceStatus === status),
        `no active record with status ${status}`
      ).toBe(true);
    }
    for (const status of VERIFICATION_STATUSES) {
      expect(MOCK_RECORDS.some((r) => r.verificationStatus === status)).toBe(true);
    }
    for (const source of SOURCE_TAGS) {
      expect(MOCK_RECORDS.some((r) => r.source === source)).toBe(true);
    }
  });

  it("includes a Rule 7 font-size failure with real measurements", () => {
    const failing = MOCK_RECORDS.flatMap((r) => r.extraction.fontSizeChecks).filter(
      (check) => !check.passed
    );
    expect(failing.length).toBeGreaterThan(0);
    for (const check of failing) {
      expect(check.measuredHeightMm).toBeLessThan(check.requiredHeightMm);
    }
  });

  it("gives every image meaningful alt text", () => {
    for (const record of MOCK_RECORDS) {
      expect(record.thumbnail.altText.trim().length).toBeGreaterThan(0);
      for (const item of record.evidence) {
        expect(item.image.altText.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps archived records out of the default list", () => {
    expect(MOCK_RECORDS.some((r) => r.archived)).toBe(true);
    expect(MOCK_ACTIVE_RECORDS.every((r) => !r.archived)).toBe(true);
  });
});

describe("dashboard KPIs", () => {
  it("agrees with the records the Records page would show", () => {
    const byId = new Map(MOCK_KPIS.map((kpi) => [kpi.id, kpi]));
    expect(byId.get("productsScanned")?.value).toBe(MOCK_ACTIVE_RECORDS.length);

    for (const [id, status] of [
      ["compliant", "Compliant"],
      ["nonCompliant", "Non-Compliant"],
      ["pending", "Pending"],
    ] as const) {
      expect(byId.get(id)?.value).toBe(
        MOCK_ACTIVE_RECORDS.filter((r) => r.complianceStatus === status).length
      );
    }
  });

  it("counts Pending as records still awaiting verification", () => {
    const pending = MOCK_KPIS.find((kpi) => kpi.id === "pending");
    expect(pending?.value).toBe(
      MOCK_ACTIVE_RECORDS.filter((r) => r.verificationStatus === "Extracted").length
    );
  });
});

describe("manufacturer scorecards", () => {
  it("flags a manufacturer only on the documented threshold", () => {
    for (const card of MOCK_SCORECARDS) {
      expect(card.repeatViolationFlagged).toBe(
        card.recentNonCompliantCount >= REPEAT_VIOLATION_THRESHOLD.nonCompliantCount
      );
    }
  });

  it("produces at least one manufacturer with a single-point trend", () => {
    expect(MOCK_SCORECARDS.some((card) => card.complianceTrend.length === 1)).toBe(
      true
    );
  });
});
