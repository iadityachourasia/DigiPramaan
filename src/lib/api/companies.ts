/**
 * companies.ts — Phase 5's Company Profile -> Manufacturer Scorecard
 * adapter. Adapts the real backend's `GET /companies` list / `GET
 * /companies/{id}/profile` (Phase 4's build_company_profile) response
 * shapes into the EXISTING frontend `ManufacturerScorecard`/
 * `ManufacturerSummary` contracts (src/types/manufacturer.ts), so
 * ScorecardView/ScorecardCard/RecordsTable need zero changes — only
 * manufacturers.ts's fetch functions are rewired to call this instead of
 * the mock route.
 *
 * The manufacturer "id" changes meaning here: previously a hardcoded
 * 7-entry mock fixture id, now the real LegalEntity UUID. ScorecardCard/
 * ROUTES.manufacturerDetail already just pass `summary.id` through, so
 * nothing downstream needs to know the difference.
 */

import {
  REPEAT_VIOLATION_THRESHOLD,
  type ComplianceRatePoint,
  type ManufacturerScorecard,
} from "@/types";
import type { ComplianceRecord, ViolationCategoryId } from "@/types";

export interface CompanyListEntry {
  id: string;
  name: string;
  totalVerifiedInspections: number;
  complianceRatePercentage: number;
  firstScannedAt: string | null;
  lastScannedAt: string | null;
}

interface RecentInspection {
  recordId: string;
  scannedAt: string | null;
  verifiedAt: string | null;
  complianceStatus: string;
  complianceScore: number | null;
  productName: string | null;
  manufacturerName: string | null;
  source: string;
  category: string | null;
  region: string | null;
  violationCount: number;
}

export interface CompanyProfileResponse {
  legalEntity: { id: string; name: string };
  totalVerifiedInspections: number;
  distinctProductCount: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercentage: number;
  complianceTrend: { period: string; ratePercentage: number; sampleSize: number }[] | null;
  violationDistribution: { categoryId: ViolationCategoryId; count: number }[];
  repeatViolationFlagged: boolean;
  recentNonCompliantCount: number;
  openCaseCount: number;
  riskScore: number;
  riskLevel: string;
  topRiskReasons: string[];
  recentInspections: RecentInspection[];
}

/** Minimal-but-valid ComplianceRecord for RecordsTable, built from a lightweight
 * recentInspection row rather than a second full-record fetch per row. Known
 * limitation: only the last 10 verified inspections, not full history. */
function inspectionToRecord(entry: RecentInspection): ComplianceRecord {
  return {
    id: entry.recordId,
    scanId: entry.recordId,
    productName: entry.productName ?? "Unknown product",
    manufacturerName: entry.manufacturerName ?? "Unknown manufacturer",
    category: (entry.category ?? "Other") as ComplianceRecord["category"],
    region: entry.region ?? "",
    source: (entry.source ?? "Officer-Scanned") as ComplianceRecord["source"],
    verificationStatus: "Verified",
    complianceStatus: entry.complianceStatus as ComplianceRecord["complianceStatus"],
    needsReviewFlag: false,
    flaggedForEnforcement: false,
    checklist: [],
    violations: Array.from({ length: entry.violationCount }, () => ({
      categoryId: "other",
      category: "Other",
      legalBasis: "",
    })),
    ...(entry.complianceScore !== null
      ? {
          complianceScore: {
            value: entry.complianceScore,
            band:
              entry.complianceScore >= 90
                ? "Excellent"
                : entry.complianceScore >= 70
                  ? "Good"
                  : entry.complianceScore >= 40
                    ? "Poor"
                    : "Critical",
            breakdownByCategory: {},
          },
        }
      : {}),
    extraction: {
      scanId: entry.recordId,
      processingStatus: "Completed",
      overallConfidence: 100,
      declarations: [],
      fontSizeChecks: [],
      barcodeAnalysis: null,
    },
    evidence: [],
    auditTrail: [],
    thumbnail: {
      id: `${entry.recordId}-thumbnail`,
      fileName: "placeholder.svg",
      url: "/images/placeholder/other.svg",
      sizeBytes: 0,
      angle: "front",
      altText: `No photo on file for ${entry.productName ?? "this product"} — placeholder image.`,
    },
    capturedImages: [],
    scannedAt: entry.scannedAt ?? entry.verifiedAt ?? new Date(0).toISOString(),
    lastUpdatedAt: entry.verifiedAt ?? entry.scannedAt ?? new Date(0).toISOString(),
    archived: false,
  };
}

export function companyListToSummary(entries: CompanyListEntry[]): ManufacturerScorecard["summary"][] {
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    totalProductsScanned: e.totalVerifiedInspections,
    complianceRatePercentage: e.complianceRatePercentage,
    firstScannedAt: e.firstScannedAt ?? new Date(0).toISOString(),
    lastScannedAt: e.lastScannedAt ?? new Date(0).toISOString(),
  }));
}

export function companyProfileToScorecard(profile: CompanyProfileResponse): ManufacturerScorecard {
  const scannedDates = profile.recentInspections
    .map((r) => r.scannedAt)
    .filter((d): d is string => Boolean(d))
    .sort();

  const complianceTrend: ComplianceRatePoint[] = (profile.complianceTrend ?? []).map((t) => ({
    date: t.period,
    ratePercentage: t.ratePercentage,
    sampleSize: t.sampleSize,
  }));

  return {
    summary: {
      id: profile.legalEntity.id,
      name: profile.legalEntity.name,
      totalProductsScanned: profile.totalVerifiedInspections,
      complianceRatePercentage: profile.complianceRatePercentage,
      firstScannedAt: scannedDates[0] ?? new Date(0).toISOString(),
      lastScannedAt: scannedDates[scannedDates.length - 1] ?? new Date(0).toISOString(),
    },
    repeatViolationFlagged: profile.repeatViolationFlagged,
    recentNonCompliantCount: profile.recentNonCompliantCount,
    repeatViolationThreshold: REPEAT_VIOLATION_THRESHOLD,
    complianceTrend,
    violationBreakdown: profile.violationDistribution,
    products: profile.recentInspections.map(inspectionToRecord),
  };
}
