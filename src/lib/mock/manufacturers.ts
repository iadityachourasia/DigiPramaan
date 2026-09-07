/**
 * Manufacturer Scorecard fixtures (page 9), derived from MOCK_RECORDS.
 *
 * The repeat-violation flag is computed from the same documented heuristic the
 * product describes to its users: three or more Non-Compliant records inside 90
 * days. 09 §2 asks the system to be upfront that this is a threshold and not a
 * model, so it is a plain count here and nothing more.
 *
 * NOT THE LIVE PATH. These constants are computed once, at module load, from
 * the static seeds only — the page reads
 * `computeManufacturerScorecards()` in `lib/server/scan-pipeline-store.ts`
 * instead, which runs the same maths over the live+static merge so a
 * manufacturer scanned through the pipeline appears on their own scorecard.
 * What survives here is the seed-only fixture the unit tests assert against
 * (including the deliberate single-scan manufacturer, which is the thin-data
 * case 09 §4 wants labelled rather than drawn as a flat line).
 */

import {
  REPEAT_VIOLATION_THRESHOLD,
  VIOLATION_CATEGORY_IDS,
  type ComplianceRatePoint,
  type ManufacturerScorecard,
  type ViolationBreakdownEntry,
} from "@/types";

import { MOCK_MANUFACTURERS } from "./reference";
import { MOCK_ACTIVE_RECORDS } from "./records";

/** Fixed "today" so a demo run months from now still shows a stable window. */
const REFERENCE_NOW = new Date("2026-09-05T12:00:00+05:30");

function withinThresholdWindow(iso: string): boolean {
  const days =
    (REFERENCE_NOW.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  return days <= REPEAT_VIOLATION_THRESHOLD.withinDays;
}

function buildScorecard(id: string, name: string): ManufacturerScorecard {
  const products = MOCK_ACTIVE_RECORDS.filter((r) => r.manufacturerName === name);
  const verified = products.filter((r) => r.verificationStatus === "Verified");
  const compliant = verified.filter((r) => r.complianceStatus === "Compliant");
  const nonCompliant = verified.filter((r) => r.complianceStatus === "Non-Compliant");

  const recentNonCompliantCount = nonCompliant.filter((r) =>
    withinThresholdWindow(r.lastUpdatedAt)
  ).length;

  const violationBreakdown: ViolationBreakdownEntry[] = VIOLATION_CATEGORY_IDS.map(
    (categoryId) => ({
      categoryId,
      count: products.reduce(
        (sum, record) =>
          sum + record.violations.filter((v) => v.categoryId === categoryId).length,
        0
      ),
    })
  ).filter((entry) => entry.count > 0);

  const dates = products
    .map((r) => r.scannedAt)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  /**
   * One point per record, oldest first. A manufacturer with a single scan produces a
   * single point, which is the case 09 §4 wants labelled as too thin for a trend
   * rather than drawn as a flat line.
   */
  const complianceTrend: ComplianceRatePoint[] = verified
    .slice()
    .sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime())
    .map((record, index, all) => {
      const upTo = all.slice(0, index + 1);
      const compliantSoFar = upTo.filter(
        (r) => r.complianceStatus === "Compliant"
      ).length;
      return {
        date: record.scannedAt.slice(0, 10),
        ratePercentage: Math.round((compliantSoFar / upTo.length) * 100),
        sampleSize: upTo.length,
      };
    });

  return {
    summary: {
      id,
      name,
      totalProductsScanned: products.length,
      complianceRatePercentage:
        verified.length === 0
          ? 0
          : Math.round((compliant.length / verified.length) * 100),
      firstScannedAt: dates[0] ?? "",
      lastScannedAt: dates[dates.length - 1] ?? "",
    },
    repeatViolationFlagged:
      recentNonCompliantCount >= REPEAT_VIOLATION_THRESHOLD.nonCompliantCount,
    recentNonCompliantCount,
    complianceTrend,
    violationBreakdown,
    products: [...products],
  };
}

export const MOCK_SCORECARDS: readonly ManufacturerScorecard[] =
  MOCK_MANUFACTURERS.map((m) => buildScorecard(m.id, m.name));

export function findMockScorecard(id: string): ManufacturerScorecard | undefined {
  return MOCK_SCORECARDS.find((s) => s.summary.id === id);
}
