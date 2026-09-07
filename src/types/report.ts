/**
 * report.ts — Reports & Profile (page 10).
 *
 * The PS asks for reports in "PDF and editable formats", so the editable options are
 * first-class here rather than an afterthought behind a PDF default.
 */

import type { RecordFilters } from "./compliance";
import type { Role } from "./vocabulary";

/*
 * PDF plus one editable format, which is what the PS requires ("PDF and
 * editable formats" — BRD FR-FILE-04 records the "and, not or") and what
 * 13-history-and-hierarchy.md settles on: ".docx is the safe default", with
 * a second editable format still an open question there (§7).
 *
 * XLSX was deliberately removed rather than left typed-but-unproducible. A
 * format the UI can offer but the download route cannot render is worse than
 * one that isn't offered — re-widening this list is the smaller change.
 */
export const REPORT_FORMATS = ["PDF", "DOCX"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** File extension and MIME type per format, used by the download route. */
export const REPORT_FORMAT_FILE: Record<ReportFormat, { extension: string; mimeType: string }> = {
  PDF: { extension: "pdf", mimeType: "application/pdf" },
  DOCX: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

/**
 * Rows above which the Report Builder warns before generating (10 §4's "very
 * large report scope"). The specs name no number, so this is a judgement
 * call: roughly ten pages of per-record sections, the point at which a
 * reader would want to be told before waiting. Interpolated into the warning
 * copy so the number and the sentence cannot drift apart.
 */
export const LARGE_REPORT_ROW_THRESHOLD = 100;

/** Single record, or a filtered set carried over from Compliance Records. */
export type ReportScope =
  | { kind: "record"; recordId: string }
  | { kind: "manufacturer"; manufacturerId: string }
  | { kind: "filtered"; filters: RecordFilters };

export type ReportGenerationStatus =
  | "idle"
  | "generating"
  | "completed"
  | "failed";

/**
 * The three stages of a generation run. Mirrors the scan pipeline's own
 * stage model (03 §2 Step 5) so the tracker reads identically, but stays a
 * separate union — widening `PipelineStageId` would put report stages into
 * the scan pipeline's type, where they mean nothing.
 */
export const REPORT_STAGE_IDS = ["collecting", "rendering", "finalising"] as const;
export type ReportStageId = (typeof REPORT_STAGE_IDS)[number];

export interface ReportStage {
  id: ReportStageId;
  state: "pending" | "in_progress" | "completed" | "failed";
  summary?: string;
  failureReason?: string;
}

/** A generation run in flight. Terminal runs carry the finished `report`. */
export interface ReportRun {
  id: string;
  stages: ReportStage[];
  status: ReportGenerationStatus;
  /** Present once every stage has completed. */
  report?: GeneratedReport;
}

/**
 * Why generation refused to start. Returned with a 200 alongside no report,
 * exactly as `verifyRecord` returns `blockedFields` rather than an error
 * status (04 §4) — the user clicks and is told precisely why, instead of
 * facing an inert button with no explanation.
 */
export type ReportBlockReason = "zero-records" | "no-format";

export interface GeneratedReport {
  id: string;
  /** Human-readable scope description shown in Download History. */
  name: string;
  scope: ReportScope;
  formats: ReportFormat[];
  /** ISO 8601. */
  generatedAt: string;
  generatedByUserId: string;
  generatedByUserName: string;
  /**
   * Printed on the PDF and encoded in its QR, so a printed report can be
   * checked back against the system later (13 §2). Resolves to this
   * report's own Download History entry.
   */
  referenceCode: string;
  /** Rows covered, used for the large-scope warning before generation. */
  rowCount: number;
}

/*
 * Note there is deliberately no `downloadUrls` field. Generated files are
 * never stored: the download route re-renders from `scope` on every
 * request, so re-download works months later without a file store, an
 * expiry policy, or the dead `/api/reports/rpt-5001.pdf` links the earlier
 * fixtures carried. From the user's side this is still "re-download without
 * regeneration" (10 §6) — they never see a second progress run.
 */

/* ------------------------------------------------------------------ *
 * The assembled document
 * ------------------------------------------------------------------ */

/**
 * Officer attribution (13 §2) — name, role, region and the date verification
 * was completed, pulled from the record audit trail rather than re-entered.
 *
 * Three variants because one block cannot honestly serve all three cases:
 *
 * - `verifier` — a single-record report on a Verified record. The person
 *   named actually verified it.
 * - `unverified` — a single-record report on a record still Pending. There
 *   is no Verified event to read, so the document says so rather than
 *   inventing an attribution.
 * - `compiler` — a multi-record report. The current user compiled it but did
 *   not verify its constituent records, which each carry their own verifier
 *   line in the body. Presenting the compiler as the verifier would be wrong
 *   on a document that may end up in an enforcement file.
 */
export type ReportAttribution =
  | { kind: "verifier"; name: string; role: Role; region: string; verifiedAt: string }
  | { kind: "compiler"; name: string; role: Role; region: string; compiledAt: string }
  | { kind: "unverified" };

export interface ReportViolationLine {
  /** Verbatim canonical taxonomy wording. */
  category: string;
  legalBasis: string;
  detail?: string;
}

export interface ReportRecordSection {
  recordId: string;
  scanId: string;
  productName: string;
  manufacturerName: string;
  category: string;
  region: string;
  complianceStatus: string;
  /** Absent while the record is still Pending. */
  complianceScore?: number;
  /** This record own verifier, for a multi-record report. */
  verifier?: { name: string; role: Role; verifiedAt: string };
  violations: ReportViolationLine[];
}

/**
 * One assembly, three renderers: the in-browser preview, the PDF and the
 * DOCX all read this same structure, so what a user previews is what they
 * download (13 §2 asks for a preview of the PDF layout, not a separate view
 * that could drift from it).
 */
export interface ReportDocument {
  title: string;
  scopeDescription: string;
  generatedAt: string;
  referenceCode: string;
  /** Absolute URL the QR encodes, resolving back to this report entry. */
  verifyUrl: string;
  attribution: ReportAttribution;
  records: ReportRecordSection[];
  totalRecords: number;
  /** True when the body was capped; the document says so rather than truncating silently. */
  truncated: boolean;
}

/**
 * A-12 / WCAG 1.3.1: linked PDFs must be tagged accessible. This flag records
 * whether the backend produced a tagged PDF, so the UI can warn rather than link an
 * untagged document silently.
 */
export interface ReportAccessibility {
  pdfIsTagged: boolean;
}

/* ------------------------------------------------------------------ *
 * Profile and settings (page 10)
 * ------------------------------------------------------------------ */

export interface ProfileDetails {
  fullName: string;
  username: string;
  email: string;
  role: Role;
  department: string;
}

export interface NotificationSettings {
  /**
   * In-app is the only channel in scope.
   *
   * TODO: BRD §15 Q-08 is unresolved — whether email, SMS or WhatsApp are required
   * at launch. The extra channels are typed but default to false so turning one on
   * is a deliberate decision, not a silent default.
   */
  inApp: boolean;
  email: boolean;
  sms: boolean;
}
