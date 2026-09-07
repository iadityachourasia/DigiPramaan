/**
 * grievance.ts — Citizen Grievance Portal (page 11).
 *
 * This is the only public, unauthenticated surface in the product. It runs without
 * the app shell and without an account, and its status vocabulary is deliberately
 * separate from the internal one.
 */

import type { UploadedImage } from "./scan";
import type { PublicGrievanceStatus } from "./vocabulary";

/**
 * What the citizen thinks is wrong. Plain language on purpose — a member of the
 * public should not have to know the taxonomy. The backend maps these onto the
 * canonical categories; the portal never shows a rule citation.
 */
export const GRIEVANCE_CONCERNS = [
  "priceNotShown",
  "noManufacturerInfo",
  "textTooSmall",
  "other",
] as const;
export type GrievanceConcern = (typeof GRIEVANCE_CONCERNS)[number];

export interface GrievanceSubmission {
  /** The one required field. Everything else is optional by design. */
  photo: UploadedImage;
  concerns: GrievanceConcern[];
  /** Free text when "other" is selected, or extra detail on any concern. */
  concernNote?: string;
  shopNameOrLocation?: string;
  /**
   * Submitter contact is explicitly optional. 11 §2 is direct about why: requiring
   * it would suppress submissions.
   */
  submitterName?: string;
  submitterContact?: string;
}

/**
 * What a citizen actually told us, carried onto the record an officer sees.
 *
 * Deliberately its own field rather than entries in `violations[]`: that array
 * is what the rule engine writes after verification, and a citizen report is a
 * claim, not a finding. Mixing them would make an unverified complaint read as
 * a confirmed violation on the Product Compliance Detail page.
 *
 * Contact details are deliberately absent. They are PII (BRD Security), and
 * `ComplianceRecord` is served by the broadly-readable `/api/records`, so name
 * and contact stay in the grievance store instead. Only the boolean travels.
 */
export interface CitizenReportDetails {
  concerns: GrievanceConcern[];
  concernNote?: string;
  shopNameOrLocation?: string;
  /** Whether the submitter left contact details, never the details themselves. */
  hasContactDetails: boolean;
  /** The tracking reference, so an officer can tie a record back to its report. */
  reference: string;
}

export interface GrievanceReceipt {
  /** Tracking reference the citizen saves or screenshots. */
  reference: string;
  /** ISO 8601. */
  submittedAt: string;
}

/**
 * Result of a public status lookup. Coarse on purpose — it never exposes internal
 * Compliance Status, officer names, or workflow detail.
 */
export interface GrievanceStatusLookup {
  reference: string;
  status: PublicGrievanceStatus;
  /** ISO 8601. */
  lastUpdatedAt: string;
}

/**
 * Photo-quality hint. 11 §4: a blurry or dark photo produces a gentle suggestion to
 * retake, and never blocks submission.
 */
export interface PhotoQualityHint {
  isLikelyPoorQuality: boolean;
  reason?: "blurry" | "dark";
}

/**
 * The actor recorded against a citizen submission.
 *
 * Not a mock user id. `mockUserName` falls back to the literal "System" for an
 * unknown id, which would make a citizen report read in the audit trail as
 * something the system did to itself. A citizen is also genuinely not a user
 * of this product — inventing a `User` for one would put a fourth actor into a
 * Role Permission Matrix that has exactly three roles.
 */
export const CITIZEN_ACTOR_ID = "citizen-public";

/**
 * A citizen submission has no inspection region, and nothing in the specs says
 * how a `Citizen-Reported` record acquires one. A named sentinel is more honest
 * than defaulting to a real state: it shows up as its own bucket in the regional
 * breakdown rather than inflating a state nobody reported from.
 */
export const CITIZEN_REGION_SENTINEL = "Not specified";

/**
 * Shown instead of a manufacturer name when a citizen report does not identify
 * one. Without this, `buildFinalRecord` falls back to the first seeded
 * manufacturer, which would file an anonymous complaint against a real company.
 */
export const UNIDENTIFIED_MANUFACTURER = "Unidentified (citizen report)";
