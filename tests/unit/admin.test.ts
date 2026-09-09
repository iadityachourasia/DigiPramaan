import { beforeEach, describe, expect, it } from "vitest";

import {
  deactivateManagedUser,
  getRuleThresholds,
  isUserActive,
  managedUsersForAdmin,
  resetAdminStoreForTests,
  updateRuleThresholds,
} from "@/lib/server/admin-store";
import {
  completePipelineRunNow,
  createPipelineRun,
  getCreatedRecord,
  getPipelineRun,
  reassignCase,
  resetPipelineStoreForTests,
  verifyRecord,
} from "@/lib/server/scan-pipeline-store";

function createMaharashtraRun(scanId: string) {
  createPipelineRun({
    scanId,
    scannedByUserId: "usr-001",
    metadata: { category: "Beverages", region: "Maharashtra" },
    images: [],
  });
  return completePipelineRunNow(scanId)!;
}

describe("Admin Console server rules", () => {
  beforeEach(() => {
    resetAdminStoreForTests();
    resetPipelineStoreForTests();
  });

  it("limits Priya's team list to Maharashtra while Sunita receives the national directory", () => {
    const caseLoads = new Map<string, number>();
    expect(managedUsersForAdmin("usr-002", caseLoads)?.map((user) => user.id)).toEqual([
      "usr-001", "usr-002", "usr-003", "usr-004", "usr-005",
    ]);
    expect(managedUsersForAdmin("usr-004", caseLoads)?.map((user) => user.id)).toEqual(["usr-004", "usr-005"]);
  });

  it("blocks self-deactivation and deactivating the only Admin in a jurisdiction", () => {
    expect(deactivateManagedUser("usr-004", "usr-004").error).toBe("You cannot deactivate your own account.");
    expect(deactivateManagedUser("usr-004", "usr-002").error).toBe("Each jurisdiction must retain one active Admin.");
    expect(isUserActive("usr-004")).toBe(true);
  });

  it("prevents assigning a case to a deactivated officer", () => {
    expect(deactivateManagedUser("usr-005", "usr-004").user?.id).toBe("usr-005");
    const record = createMaharashtraRun("ADMIN-INACTIVE-OFFICER");
    expect(reassignCase(record.id, "usr-005", "usr-004")).toBeUndefined();
  });

  it("applies an OCR threshold to future runs, not existing pipeline runs", () => {
    createMaharashtraRun("ADMIN-THRESHOLD-BEFORE");
    expect(getPipelineRun("ADMIN-THRESHOLD-BEFORE")?.stages.find((stage) => stage.id === "fallbackExtraction")?.state).toBe("completed");

    const updated = updateRuleThresholds({ ...getRuleThresholds(), ocrConfidenceThreshold: 60 });
    expect(updated?.ocrConfidenceThreshold).toBe(60);

    createMaharashtraRun("ADMIN-THRESHOLD-AFTER");
    expect(getPipelineRun("ADMIN-THRESHOLD-AFTER")?.stages.find((stage) => stage.id === "fallbackExtraction")?.state).toBe("skipped");
  });

  it("keeps a verified record's compliance band frozen when score thresholds later change", () => {
    const first = createMaharashtraRun("ADMIN-BAND-BEFORE");
    const verifiedFirst = verifyRecord(first.id, "usr-001")?.record;
    expect(verifiedFirst?.complianceScore).toBeDefined();
    const frozenBand = verifiedFirst?.complianceScore?.band;

    expect(updateRuleThresholds({ ...getRuleThresholds(), excellentMinimum: 100, goodMinimum: 99, poorMinimum: 98 })).toBeDefined();
    expect(getCreatedRecord(first.id)?.complianceScore?.band).toBe(frozenBand);

    const second = createMaharashtraRun("ADMIN-BAND-AFTER");
    const verifiedSecond = verifyRecord(second.id, "usr-001")?.record;
    expect(verifiedSecond?.complianceScore?.band).toBe("Critical");
  });
});
