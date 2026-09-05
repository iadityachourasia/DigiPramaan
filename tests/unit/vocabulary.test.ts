import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import {
  COMPLIANCE_STATUSES,
  computeComplianceStatus,
  confidenceBand,
  ROLES,
  ROLE_PERMISSIONS,
  SOURCE_TAGS,
  VIOLATION_TAXONOMY,
  can,
  type DeclarationCheck,
} from "@/types";

/**
 * Pages_Userflow/00-README.md's "definition-of-done cross-check" asks a human to
 * confirm, after all eleven pages exist, that the status values, the taxonomy and
 * the role names read identically everywhere. Doing that by eye across eleven pages
 * is exactly the check that gets skipped under demo pressure, so the parts that can
 * be checked mechanically are checked here instead.
 */

describe("fixed vocabulary parity with the message catalogue", () => {
  it("has an English string for every Compliance Status, verbatim", () => {
    for (const status of COMPLIANCE_STATUSES) {
      expect(en.vocabulary.complianceStatus[status]).toBe(status);
    }
  });

  it("has an English string for every source tag, verbatim", () => {
    for (const source of SOURCE_TAGS) {
      expect(en.vocabulary.sourceTag[source]).toBe(source);
    }
  });

  it("writes every role name in full", () => {
    for (const role of ROLES) {
      expect(en.vocabulary.role[role]).toBe(role);
    }
    expect(ROLES).not.toContain("Officer");
  });

  it("keeps the taxonomy identical between the type layer and the catalogue", () => {
    for (const entry of VIOLATION_TAXONOMY) {
      const message = en.violationTaxonomy[entry.id];
      expect(message.category).toBe(entry.category);
      expect(message.legalBasis).toBe(entry.legalBasis);
    }
  });

  it("carries exactly ten violation categories", () => {
    expect(VIOLATION_TAXONOMY).toHaveLength(10);
  });
});

describe("computeComplianceStatus", () => {
  const passing: DeclarationCheck[] = [
    { fieldId: "netQuantity", passed: true, value: "1 L" },
  ];
  const failing: DeclarationCheck[] = [
    {
      fieldId: "netQuantity",
      passed: false,
      value: null,
      violationCategoryId: "net-quantity-missing-or-incorrect",
    },
  ];

  it("is Pending while verification has not happened, whatever the checklist says", () => {
    expect(
      computeComplianceStatus({
        verificationStatus: "Extracted",
        needsReviewFlag: false,
        checklist: failing,
      })
    ).toBe("Pending");
  });

  it("is Compliant when verified with no failed items", () => {
    expect(
      computeComplianceStatus({
        verificationStatus: "Verified",
        needsReviewFlag: false,
        checklist: passing,
      })
    ).toBe("Compliant");
  });

  it("is Non-Compliant when verified with one or more failed items", () => {
    expect(
      computeComplianceStatus({
        verificationStatus: "Verified",
        needsReviewFlag: false,
        checklist: failing,
      })
    ).toBe("Non-Compliant");
  });

  it("lets the manual Needs Review flag override the computed value", () => {
    expect(
      computeComplianceStatus({
        verificationStatus: "Verified",
        needsReviewFlag: true,
        checklist: passing,
      })
    ).toBe("Needs Review");
  });
});

describe("confidenceBand", () => {
  it("splits at the documented boundaries", () => {
    expect(confidenceBand(90)).toBe("High");
    expect(confidenceBand(89)).toBe("Medium");
    expect(confidenceBand(70)).toBe("Medium");
    expect(confidenceBand(69)).toBe("Low");
  });
});

describe("Role Permission Matrix", () => {
  it("gives Reviewer oversight without verification or enforcement authority", () => {
    expect(can("Reviewer", "record.flagNeedsReview")).toBe(true);
    expect(can("Reviewer", "analytics.view")).toBe(true);
    expect(can("Reviewer", "report.generate")).toBe(true);
    expect(can("Reviewer", "verification.confirm")).toBe(false);
    expect(can("Reviewer", "record.flagForEnforcement")).toBe(false);
    expect(can("Reviewer", "scan.create")).toBe(false);
  });

  it("reserves archive and bulk status change for Admin", () => {
    expect(can("Admin", "record.archive")).toBe(true);
    expect(can("Admin", "record.bulkStatusChange")).toBe(true);
    expect(can("Enforcement Officer", "record.archive")).toBe(false);
    expect(can("Enforcement Officer", "record.bulkStatusChange")).toBe(false);
  });

  it("lets all three roles flag Needs Review and generate reports", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toContain("record.flagNeedsReview");
      expect(ROLE_PERMISSIONS[role]).toContain("report.generate");
    }
  });
});
