/**
 * compliance.ts — the compliance record, the checklist, and the audit trail.
 *
 * The record is the spine of the product. It is created by Scan/Upload (page 3), the
 * E-commerce Listing Scanner (page 8) or the Citizen Grievance Portal (page 11);
 * finalized on Declaration Extraction & Verification (page 4); listed on Compliance
 * Records (page 5); read in full on Product Compliance Detail (page 6); and
 * aggregated by Analytics (page 7) and the Manufacturer Scorecard (page 9).
 */

/* No cycle: grievance.ts imports from scan.ts and vocabulary.ts only. */
import type { CitizenReportDetails } from "./grievance";
import type { ExtractionResult, ProductCategory, Scan, UploadedImage } from "./scan";
import type {
  ComplianceStatus,
  SourceTag,
  ViolationCategoryId,
  VerificationStatus,
} from "./vocabulary";

/**
 * One line of the declaration checklist. A failure carries the taxonomy category
 * and a specific, citable detail — 06 §2 is explicit that a generic "non-compliant"
 * flag is far less useful than "MRP Non-Compliance — Rule 6(e)".
 */
export interface DeclarationCheck {
  /** Matches a DeclarationFieldId, or "fontSize" for the Rule 7 result. */
  fieldId: string;
  passed: boolean;
  /** The value as finalized after verification. Null when never detected. */
  value: string | null;
  /** Set only when passed is false. */
  violationCategoryId?: ViolationCategoryId;
  /**
   * Human-readable specifics appended to the citation, e.g. "numeral height 3 mm,
   * below required 4 mm minimum". Empty for a plain missing-declaration failure.
   */
  detail?: string;
}

/** A resolved violation, ready to render in the Violation Summary. */
export interface Violation {
  categoryId: ViolationCategoryId;
  /** Verbatim taxonomy wording. Resolve through violationCategory(), never retype. */
  category: string;
  legalBasis: string;
  detail?: string;
}

/**
 * Audit trail entry (06 §2). The timeline runs Scanned, Extracted, Corrected,
 * Verified, Report Generated, Flagged for Enforcement, Flagged as Needs Review.
 */
/*
 * A runtime array with the union derived from it, matching every other fixed
 * vocabulary here. It was a bare union, which is why nothing could assert that
 * each value has a label in the message catalogue the way the other
 * vocabularies do.
 */
export const AUDIT_EVENT_TYPES = [
  "Scanned",
  "Extracted",
  "Corrected",
  "Verified",
  "Report Generated",
  "Flagged for Enforcement",
  "Flagged as Needs Review",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  /** ISO 8601. */
  at: string;
  /** Absent for system-generated events such as Extracted. */
  byUserId?: string;
  byUserName?: string;
  /** Free-text note, e.g. which fields were corrected. */
  note?: string;
}

/**
 * Compliance Score (13-history-and-hierarchy.md §1.2) — additive, does not
 * replace Compliance Status. Compliance Status governs filtering/workflow;
 * the score is finer-grained severity within Compliant/Non-Compliant. Absent
 * until a record is Verified (see computeComplianceScore()) — an unverified
 * record has nothing to score yet.
 */
export interface ComplianceScore {
  value: number;
  band: "Excellent" | "Good" | "Poor" | "Critical";
  breakdownByCategory: Partial<Record<ViolationCategoryId, number>>;
}

/** Band cutoffs per the spec's own "placeholder wording" caveat. */
export function complianceScoreBand(value: number): ComplianceScore["band"] {
  if (value >= 90) return "Excellent";
  if (value >= 70) return "Good";
  if (value >= 40) return "Poor";
  return "Critical";
}

/**
 * Placeholder formula: proportion of checklist lines that passed. The
 * frontend renders whatever this returns rather than hardcoding the shape of
 * the calculation, so a real formula can replace this later without
 * touching any rendering code.
 */
export function computeComplianceScore(
  record: Pick<ComplianceRecord, "checklist">
): ComplianceScore {
  const total = record.checklist.length;
  const passed = record.checklist.filter((line) => line.passed).length;
  const value = total === 0 ? 0 : Math.round((passed / total) * 100);
  const breakdownByCategory: Partial<Record<ViolationCategoryId, number>> = {};
  for (const line of record.checklist) {
    if (!line.passed && line.violationCategoryId) {
      breakdownByCategory[line.violationCategoryId] =
        (breakdownByCategory[line.violationCategoryId] ?? 0) + 1;
    }
  }
  return { value, band: complianceScoreBand(value), breakdownByCategory };
}

/** Supporting photographs attached to a record (PS requirement). */
export interface Evidence {
  id: string;
  image: UploadedImage;
  caption: string;
  /** ISO 8601. */
  attachedAt: string;
  attachedByUserId: string;
}

export interface ComplianceRecord {
  id: string;
  /** Human-facing scan identifier shown in the UI and on reports. */
  scanId: string;
  productName: string;
  manufacturerName: string;
  category: ProductCategory;
  region: string;
  source: SourceTag;

  /**
   * Internal workflow state. Only pages 4 and 6 surface this directly.
   */
  verificationStatus: VerificationStatus;

  /**
   * The status shown everywhere else. Computed from the checklist once verified,
   * except when needsReviewFlag is set, which overrides it until resolved.
   */
  complianceStatus: ComplianceStatus;

  /** True while a manual Needs Review escalation is outstanding. */
  needsReviewFlag: boolean;
  needsReviewByUserId?: string;
  needsReviewNote?: string;

  /** True once flagged for enforcement, so the action can be relabeled (06 §4). */
  flaggedForEnforcement: boolean;

  /**
   * Phase 4 USPs (Product Compliance DNA / Compliance Follow-Through) —
   * additive and currently inert. The mock data layer this type also
   * backs has no relationship to the real FastAPI backend's Product/
   * ViolationCase tables, so these are always undefined for a mock-sourced
   * record today; they exist so RecordDetailView's conditional links (see
   * its own comment) are correctly wired for whenever a record actually
   * carries real backend ids.
   */
  productId?: string;
  activeCaseId?: string;

  checklist: DeclarationCheck[];
  violations: Violation[];
  /** Present once Verified (see computeComplianceScore()); absent while Pending. */
  complianceScore?: ComplianceScore;
  extraction: ExtractionResult;
  evidence: Evidence[];
  auditTrail: AuditEvent[];

  /** Primary label photograph, used as the list thumbnail. */
  thumbnail: UploadedImage;

  /**
   * The captured Front/Back/Side-PDP photographs (04's two-panel layout —
   * an officer switches between these while reviewing declarations, and
   * each field's source-image badge opens the one it was actually read
   * from). Always includes at least the front image the thumbnail is drawn
   * from.
   */
  capturedImages: UploadedImage[];

  /** Original listing URL when source is E-commerce-Sourced. */
  ecommerceListingUrl?: string;

  /**
   * The E-commerce Listing Scanner batch this record came from (page 8's
   * bulk mode). Present only for records created from a batch scan — a
   * single-listing scan has a `ecommerceListingUrl` but no batch. Backs
   * 08's "completed batch results appear in Compliance Records, filterable
   * by this specific batch".
   */
  batchId?: string;

  /**
   * What the citizen reported, present only when `source` is
   * `Citizen-Reported` (page 11). Their concerns are kept here rather than in
   * `violations[]`, which holds the rule engine verified findings — a report
   * is a claim until an officer verifies it.
   */
  citizenReport?: CitizenReportDetails;

  /**
   * The Enforcement Officer this case currently belongs to (13 §4.2 —
   * jurisdiction scoping and case reassignment). Not in §4.1's own code
   * block, which lists only `Jurisdiction` and `User` fields, but
   * necessary: without a field that reassignment can actually change,
   * "an Officer always sees their own cases" and "an Admin can reassign a
   * case between Officers" would have nothing to read or write, and
   * reassignment would be an audit-log gesture with no visibility effect.
   *
   * Populated at creation from the scanning officer where one exists
   * (Officer-Scanned, E-commerce-Sourced); absent for Citizen-Reported,
   * which has no officer to assign. Distinct from `auditTrail[0].byUserId`
   * — that stays a historical fact (who originally scanned it) and must
   * never change; this is the current assignment and is exactly what
   * `reassignCase()` moves.
   */
  assignedOfficerUserId?: string;
  /** ISO 8601. */
  scannedAt: string;
  lastUpdatedAt: string;
  /** Admin-only archive action (00-README.md §C). */
  archived: boolean;
}

/**
 * Compute Compliance Status from the record's own state, exactly as 00-README.md §A
 * defines it. Kept as a function so no page re-implements the rule from memory.
 *
 * Needs Review is a human override and always wins. Otherwise, an unverified record
 * is Pending regardless of what the checklist currently says, because nothing is
 * determined until a person confirms it.
 */
export function computeComplianceStatus(
  record: Pick<
    ComplianceRecord,
    "verificationStatus" | "needsReviewFlag" | "checklist"
  >
): ComplianceStatus {
  if (record.needsReviewFlag) return "Needs Review";
  if (record.verificationStatus === "Extracted") return "Pending";
  const hasFailure = record.checklist.some((item) => !item.passed);
  return hasFailure ? "Non-Compliant" : "Compliant";
}

/* ------------------------------------------------------------------ *
 * Records list (page 5)
 * ------------------------------------------------------------------ */

export interface RecordFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  categories: ProductCategory[];
  complianceStatuses: ComplianceStatus[];
  regions: string[];
  manufacturers: string[];
  sources: SourceTag[];
  /**
   * Matches a record with at least one violation in any of these categories
   * (07-analytics-violation-trends.md's violation-type breakdown is this
   * page's central metric, so unlike other analytics dimensions this one
   * gets a real filter rather than the lossy `complianceStatuses=Non-Compliant`
   * approximation used elsewhere for the same gap).
   */
  violationCategoryIds: ViolationCategoryId[];
  /**
   * Deep-link-only filter (08's bulk mode links here from a completed
   * batch). Unlike every other dimension this one has no dropdown — a batch
   * id isn't something a user picks from a list, it's arrived at from the
   * batch itself — but it still renders as a removable chip like the rest.
   */
  batchIds: string[];
}

export const RECORD_SORT_OPTIONS = [
  "newest",
  "oldest",
  "alphabetical",
  "status",
  "relevance",
] as const;
export type RecordSort = (typeof RECORD_SORT_OPTIONS)[number];

export interface RecordsPage {
  rows: ComplianceRecord[];
  /** Total matching the filters, for "Showing 1-20 of 3,412". */
  totalCount: number;
  page: number;
  pageSize: number;
}

/** Re-exported so a page importing the record type also gets its scan. */
export type { Scan };
