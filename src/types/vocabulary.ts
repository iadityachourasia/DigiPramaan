/**
 * vocabulary.ts — the fixed vocabulary from Pages_Userflow/00-README.md §D,
 * expressed once so no page can paraphrase it.
 *
 * 00-README.md §D and the BRD's §9.2 terminology rule both say these exact strings
 * must appear verbatim on every screen. Import the constants; never retype a status,
 * role, source tag or taxonomy category as a string literal in a component.
 *
 * Every user-facing rendering of these values goes through the i18n message files
 * (src/messages/*.json) keyed by the identifiers below. The English message values
 * are the verbatim strings.
 */

/* ------------------------------------------------------------------ *
 * Status model (00-README.md §A)
 * ------------------------------------------------------------------ */

/**
 * Verification Status — internal workflow state. Relevant only on the Declaration
 * Extraction & Verification page and the Product Compliance Detail page.
 */
export const VERIFICATION_STATUSES = ["Extracted", "Verified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Compliance Status — the four-value status shown everywhere else.
 *
 * Pending       Verification Status is still Extracted. The default for every new
 *               record. Means "compliance has not yet been determined", never
 *               "processing is slow" — do not write UI copy that implies a backlog.
 * Compliant     Verified, and the declaration checklist has zero failed items.
 * NonCompliant  Verified, and the checklist has one or more failed items.
 * NeedsReview   A manual escalation flag applied via "Flag as Needs Review". Never
 *               computed. Overrides the auto-computed value until resolved.
 */
export const COMPLIANCE_STATUSES = [
  "Pending",
  "Compliant",
  "Non-Compliant",
  "Needs Review",
  "Not Applicable",
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

/** Source tags (00-README.md §D). */
export const SOURCE_TAGS = [
  "Officer-Scanned",
  "Citizen-Reported",
  "E-commerce-Sourced",
] as const;
export type SourceTag = (typeof SOURCE_TAGS)[number];

/**
 * Roles. Always written in full. 00-README.md §C is explicit that "Officer" must
 * never appear in anything that becomes a literal permission check.
 */
export const ROLES = ["Enforcement Officer", "Admin", "Reviewer"] as const;
export type Role = (typeof ROLES)[number];

/**
 * OCR pipeline status — a third, short-lived technical state, separate from both
 * Verification Status and Compliance Status (04-extraction-verification.md §2).
 * Only meaningful while the extraction pipeline is actively running.
 */
export const PROCESSING_STATUSES = [
  "Queued",
  "Processing",
  "Completed",
  "Failed",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/** Upload lifecycle on the Scan/Upload page (03-scan-upload.md §2). */
export const UPLOAD_STATUSES = [
  "Queued",
  "Uploading",
  "Processing",
  "Completed",
  "Failed",
] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/**
 * Public-facing grievance status (11-citizen-grievance-portal.md §2). Deliberately
 * coarse and deliberately NOT the internal Compliance Status vocabulary — a citizen
 * must never see internal officer workflow detail.
 */
export const PUBLIC_GRIEVANCE_STATUSES = [
  "Received",
  "Under Review",
  "Resolved",
] as const;
export type PublicGrievanceStatus = (typeof PUBLIC_GRIEVANCE_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * Canonical Violation Taxonomy (00-README.md §B)
 * ------------------------------------------------------------------ */

/**
 * The single 10-category list used identically by the per-field checklist on
 * Extraction & Verification, the Violation Summary on Product Compliance Detail,
 * the breakdown chart on Analytics, and the breakdown on the Manufacturer Scorecard.
 *
 * `shortLabel` exists only for chart axis labels. 00-README.md §B allows the
 * abbreviation in an axis label and forbids it in a legend, tooltip, or written
 * summary — those use `category`.
 */
export interface ViolationCategoryDefinition {
  readonly id: ViolationCategoryId;
  readonly category: string;
  readonly legalBasis: string;
  readonly shortLabel: string;
}

export const VIOLATION_CATEGORY_IDS = [
  "manufacturer-details-missing",
  "generic-name-missing-or-incorrect",
  "net-quantity-missing-or-incorrect",
  "manufacture-import-date-missing",
  "mrp-non-compliance",
  "country-of-origin-missing",
  "consumer-care-details-missing",
  "font-size-readability-failure",
  "non-standard-or-misleading-format",
  "other",
] as const;
export type ViolationCategoryId = (typeof VIOLATION_CATEGORY_IDS)[number];

export const VIOLATION_TAXONOMY: readonly ViolationCategoryDefinition[] = [
  {
    id: "manufacturer-details-missing",
    category: "Manufacturer/Packer/Importer Details Missing",
    legalBasis: "Rule 6(a)",
    shortLabel: "Manufacturer details",
  },
  {
    id: "generic-name-missing-or-incorrect",
    category: "Generic Name Missing or Incorrect",
    legalBasis: "Rule 6(b)",
    shortLabel: "Generic name",
  },
  {
    id: "net-quantity-missing-or-incorrect",
    category: "Net Quantity Missing or Incorrect",
    legalBasis: "Rule 6(c)",
    shortLabel: "Net quantity",
  },
  {
    id: "manufacture-import-date-missing",
    category: "Manufacture/Import Date Missing",
    legalBasis: "Rule 6(d)",
    shortLabel: "Mfg/import date",
  },
  {
    id: "mrp-non-compliance",
    category: "MRP Non-Compliance",
    legalBasis: "Rule 6(e)",
    shortLabel: "MRP",
  },
  {
    id: "country-of-origin-missing",
    category: "Country of Origin Missing",
    legalBasis: "Rule 6 (imports only)",
    shortLabel: "Country of origin",
  },
  {
    id: "consumer-care-details-missing",
    category: "Consumer Care Details Missing",
    legalBasis: "Rule 6",
    shortLabel: "Consumer care",
  },
  {
    id: "font-size-readability-failure",
    category: "Font Size / Readability Failure",
    legalBasis: "Rule 7",
    shortLabel: "Font size",
  },
  {
    id: "non-standard-or-misleading-format",
    category: "Non-Standard or Misleading Format",
    legalBasis: "Rule 8/9",
    shortLabel: "Format",
  },
  {
    id: "other",
    category: "Other",
    legalBasis: "—",
    shortLabel: "Other",
  },
] as const;

/** Lookup helper so no page hand-writes a taxonomy string. */
export function violationCategory(
  id: ViolationCategoryId
): ViolationCategoryDefinition {
  const found = VIOLATION_TAXONOMY.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unknown violation category id: ${id}`);
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * Confidence bands (00-README.md §D)
 * ------------------------------------------------------------------ */

export const CONFIDENCE_BANDS = ["High", "Medium", "Low"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/**
 * Derive the band shown alongside the raw percentage.
 * High >= 90, Medium 70-89, Low < 70.
 */
export function confidenceBand(percentage: number): ConfidenceBand {
  if (percentage >= 90) return "High";
  if (percentage >= 70) return "Medium";
  return "Low";
}
