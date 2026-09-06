/**
 * Download History fixtures (page 10).
 *
 * Both editable formats appear alongside PDF on purpose. The problem statement asks
 * for reports in "PDF and editable formats", and 10-reports-profile.md §2 is explicit
 * that defaulting to PDF-only misses the requirement.
 */

import type { GeneratedReport, ReportAccessibility } from "@/types";

export const MOCK_REPORTS: readonly GeneratedReport[] = [
  {
    id: "rpt-5001",
    name: "Compliance report — Ganga Sparkling Lemon 600 ml (LMCS-2026-001002)",
    scope: { kind: "record", recordId: "rec-1002" },
    formats: ["PDF", "DOCX"],
    generatedAt: "2026-08-30T16:02:00+05:30",
    generatedByUserId: "usr-001",
    generatedByUserName: "Rohan Deshmukh",
    downloadUrls: {
      PDF: "/api/reports/rpt-5001.pdf",
      DOCX: "/api/reports/rpt-5001.docx",
    },
    rowCount: 1,
  },
  {
    id: "rpt-5002",
    name: "Manufacturer scorecard — Ganga Beverages Ltd",
    scope: { kind: "manufacturer", manufacturerId: "mfr-002" },
    formats: ["PDF"],
    generatedAt: "2026-09-02T11:24:00+05:30",
    generatedByUserId: "usr-003",
    generatedByUserName: "Arindam Banerjee",
    downloadUrls: { PDF: "/api/reports/rpt-5002.pdf" },
    rowCount: 3,
  },
  {
    id: "rpt-5003",
    name: "Non-Compliant records — Maharashtra, August 2026",
    scope: {
      kind: "filtered",
      filters: {
        categories: [],
        complianceStatuses: ["Non-Compliant"],
        regions: ["Maharashtra"],
        manufacturers: [],
        sources: [],
        violationCategoryIds: [],
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
      },
    },
    formats: ["XLSX", "PDF"],
    generatedAt: "2026-09-01T09:15:00+05:30",
    generatedByUserId: "usr-002",
    generatedByUserName: "Sunita Iyer",
    downloadUrls: {
      XLSX: "/api/reports/rpt-5003.xlsx",
      PDF: "/api/reports/rpt-5003.pdf",
    },
    rowCount: 24,
  },
];

/**
 * A-12 / WCAG 1.3.1: a linked PDF must be tagged accessible. The backend reports
 * whether it produced one, so the UI can warn rather than link an untagged document
 * as though it were fine.
 */
export const MOCK_REPORT_ACCESSIBILITY: Record<string, ReportAccessibility> = {
  "rpt-5001": { pdfIsTagged: true },
  "rpt-5002": { pdfIsTagged: true },
  "rpt-5003": { pdfIsTagged: true },
};
