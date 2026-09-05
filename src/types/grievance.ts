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
