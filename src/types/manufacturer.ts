/**
 * manufacturer.ts — Manufacturer Compliance Scorecard (page 9).
 */

import type { ViolationBreakdownEntry } from "./analytics";
import type { ComplianceRecord } from "./compliance";

/**
 * Repeat-violation threshold. 09 §2 describes this as a simple, documented
 * heuristic rather than a model, and asks that the product be upfront about that.
 * Admin-editable per BRD §9.5 and the Role Permission Matrix.
 */
export const REPEAT_VIOLATION_THRESHOLD = {
  nonCompliantCount: 3,
  withinDays: 90,
} as const;

export interface ManufacturerSummary {
  id: string;
  name: string;
  totalProductsScanned: number;
  /** Share of Verified records that are Compliant, 0 to 100. */
  complianceRatePercentage: number;
  /** ISO 8601. */
  firstScannedAt: string;
  lastScannedAt: string;
}

export interface ComplianceRatePoint {
  /** ISO 8601 date, start of the bucket. */
  date: string;
  ratePercentage: number;
  /** Records in the bucket, so a single-scan point can be labelled as thin data. */
  sampleSize: number;
}

export interface ManufacturerScorecard {
  summary: ManufacturerSummary;
  /**
   * True once the manufacturer crosses REPEAT_VIOLATION_THRESHOLD.
   *
   * There is deliberately no inverse "clear" badge. 09 §4 warns that a clear badge
   * could be mistaken for an official certification, which this system does not
   * issue.
   */
  repeatViolationFlagged: boolean;
  /** Non-Compliant records inside the threshold window, for the flag's copy. */
  recentNonCompliantCount: number;
  complianceTrend: ComplianceRatePoint[];
  violationBreakdown: ViolationBreakdownEntry[];
  /** Same column shape as Compliance Records, filtered to this manufacturer. */
  products: ComplianceRecord[];
}

/**
 * KNOWN LIMITATION, carried from BRD R-02 and 09 §4: manufacturer name-variation
 * matching is out of scope for the MVP. Two spellings of the same company are two
 * manufacturers here, which can undercount a repeat offender. This is surfaced in
 * the Scorecard's own UI copy rather than hidden.
 */
export const MANUFACTURER_MATCHING_IS_EXACT = true;
