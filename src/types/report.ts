/**
 * report.ts — Reports & Profile (page 10).
 *
 * The PS asks for reports in "PDF and editable formats", so the editable options are
 * first-class here rather than an afterthought behind a PDF default.
 */

import type { RecordFilters } from "./compliance";
import type { Role } from "./vocabulary";

export const REPORT_FORMATS = ["PDF", "DOCX", "XLSX"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

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
  /** One download URL per format produced. */
  downloadUrls: Partial<Record<ReportFormat, string>>;
  /** Rows covered, used for the large-scope warning before generation. */
  rowCount: number;
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
