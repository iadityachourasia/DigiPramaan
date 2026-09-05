/**
 * analytics.ts — Dashboard KPIs (page 2) and Analytics & Violation Trends (page 7).
 *
 * Every breakdown that names a violation keys on ViolationCategoryId rather than a
 * label string, so the ten categories cannot drift apart between the chart, the
 * legend and the written summary.
 */

import type { ProductCategory } from "./scan";
import type {
  ComplianceStatus,
  SourceTag,
  ViolationCategoryId,
} from "./vocabulary";

/* ------------------------------------------------------------------ *
 * Dashboard (page 2)
 * ------------------------------------------------------------------ */

/**
 * One KPI card. The delta carries its own text label because 02 §2 forbids
 * signalling direction with an arrow or colour alone (A-10 / WCAG 1.4.1).
 */
export interface KpiMetric {
  id: "productsScanned" | "compliant" | "nonCompliant" | "pending";
  value: number;
  /** Share of total, for the two status KPIs. Absent for productsScanned. */
  percentageOfTotal?: number;
  /** Signed percentage change against the previous period. */
  deltaPercentage: number;
  /** Which Compliance Records filter this card routes to when clicked. */
  routesToStatus?: ComplianceStatus;
}

export interface TrendPoint {
  /** ISO 8601 date, start of the bucket. */
  date: string;
  compliant: number;
  nonCompliant: number;
  /** Optional overlay so trend and workload read together (02 §2). */
  totalScans: number;
}

export type TrendPeriod = "weekly" | "monthly";

/**
 * Dashboard alert. Severity maps to a real status token; 02 §6 calls out that
 * defaulting everything to error is a defect, not a shortcut.
 */
export interface DashboardAlert {
  id: string;
  severity: "info" | "warning" | "error";
  /** Uses canonical taxonomy wording where it names a violation. */
  message: string;
  /** Deep link to a filtered Records view or a Manufacturer Scorecard. */
  href: string;
}

/* ------------------------------------------------------------------ *
 * Analytics (page 7)
 * ------------------------------------------------------------------ */

export interface AnalyticsSummary {
  totalScanned: number;
  /** Share of verified records that are Compliant, 0 to 100. */
  complianceRatePercentage: number;
  /** Share of scans that completed extraction without failure, 0 to 100. */
  processingSuccessRatePercentage: number;
}

export interface ViolationBreakdownEntry {
  categoryId: ViolationCategoryId;
  count: number;
}

export interface CategoryBreakdownEntry {
  category: ProductCategory;
  compliant: number;
  nonCompliant: number;
}

export interface RegionBreakdownEntry {
  region: string;
  totalScanned: number;
  nonCompliant: number;
}

export interface SourceBreakdownEntry {
  source: SourceTag;
  count: number;
}

/**
 * Backend-detected spike or concentration. Surfaced as a card that drills into
 * filtered Records (07 §2).
 */
export interface AnomalyAlert {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "error";
  href: string;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  trend: TrendPoint[];
  violationBreakdown: ViolationBreakdownEntry[];
  categoryBreakdown: CategoryBreakdownEntry[];
  regionBreakdown: RegionBreakdownEntry[];
  sourceBreakdown: SourceBreakdownEntry[];
  anomalies: AnomalyAlert[];
}
