import { beforeEach, describe, expect, it } from "vitest";

import { resetAuditStoreForTests } from "@/lib/server/audit-store";
import { computeDashboardData, resetPipelineStoreForTests } from "@/lib/server/scan-pipeline-store";

describe("Dashboard's scoped live read model", () => {
  beforeEach(() => {
    resetPipelineStoreForTests();
    resetAuditStoreForTests();
  });

  it("keeps National Admin and Reviewer dashboard data nationwide", () => {
    for (const viewerId of ["usr-002", "usr-003"]) {
      const data = computeDashboardData(viewerId);
      expect(data.kpis.map((metric) => metric.value)).toEqual([11, 2, 5, 3]);
      expect(data.recentScans.map((record) => record.id)).toEqual([
        "rec-1011", "rec-1007", "rec-1003", "rec-1001", "rec-1002", "rec-1004", "rec-1005", "rec-1006",
      ]);
      expect(data.alerts.map((alert) => alert.id)).toEqual(["repeat-violation-mfr-002"]);
      expect(data.regionalDistribution).toHaveLength(9);
    }
  });

  it("narrows Rohan to his seven own cases, including the repeat-offender alert", () => {
    const data = computeDashboardData("usr-001");
    expect(data.kpis.map((metric) => metric.value)).toEqual([7, 1, 3, 2]);
    expect(data.recentScans.map((record) => record.id)).toEqual([
      "rec-1011", "rec-1003", "rec-1001", "rec-1002", "rec-1006", "rec-1008", "rec-1009",
    ]);
    expect(data.alerts.map((alert) => alert.id)).toEqual(["repeat-violation-mfr-002"]);
    expect(data.regionalDistribution).toEqual([]);
  });

  it("narrows Priya to Maharashtra and omits the roll-up", () => {
    const data = computeDashboardData("usr-004");
    expect(data.kpis.map((metric) => metric.value)).toEqual([2, 1, 0, 1]);
    expect(data.recentScans.map((record) => record.id)).toEqual(["rec-1011", "rec-1001"]);
    expect(data.alerts).toEqual([]);
    expect(data.regionalDistribution).toEqual([]);
  });

  it("shows Vikram's honest empty own-cases dashboard", () => {
    const data = computeDashboardData("usr-005");
    expect(data.kpis.map((metric) => metric.value)).toEqual([0, 0, 0, 0]);
    expect(data.recentScans).toEqual([]);
    expect(data.alerts).toEqual([]);
    expect(data.regionalDistribution).toEqual([]);
  });

  it("pre-sorts the National roll-up by non-compliance rate descending", () => {
    const rows = computeDashboardData("usr-002").regionalDistribution;
    const rates = rows.map((row) => row.nonCompliant / row.totalScanned);
    expect(rates).toEqual([...rates].sort((left, right) => right - left));
  });
});
