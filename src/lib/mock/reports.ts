/**
 * Download History fixtures (page 10).
 *
 * Seeded into `lib/server/report-store.ts` at first read, so Download History has
 * something in it on a cold start and 10 §6's "persists and supports re-download
 * without regeneration" is demonstrable immediately. The empty-history state is
 * reached with `?demo=empty`, the same accommodation other pages make for a state
 * seed data cannot produce.
 *
 * Both a single-record and a multi-record scope appear on purpose: the officer
 * attribution block behaves differently for each (13 §2), and having both seeded
 * means that difference is visible without generating anything first.
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
    referenceCode: "LMCS-RPT-5001-8F3A",
    rowCount: 1,
    recordIds: ["rec-1002"],
  },
  {
    id: "rpt-5002",
    name: "Manufacturer scorecard — Ganga Beverages Ltd",
    scope: { kind: "manufacturer", manufacturerId: "mfr-002" },
    formats: ["PDF"],
    generatedAt: "2026-09-02T11:24:00+05:30",
    generatedByUserId: "usr-003",
    generatedByUserName: "Arindam Banerjee",
    referenceCode: "LMCS-RPT-5002-C107",
    rowCount: 3,
    recordIds: ["rec-1002", "rec-1008", "rec-1009"],
  },
  {
    id: "rpt-5003",
    /*
     * The filters here have to actually match records, because re-download
     * re-resolves this scope rather than serving a saved file. An earlier
     * version of this fixture read "Non-Compliant — Maharashtra, August 2026"
     * and matched nothing at all: no seeded Non-Compliant record is in
     * Maharashtra, so re-downloading it produced a report with no records in
     * it. Dropping the region makes it a real five-record scope, which also
     * gives the multi-record "Compiled by" attribution something to render.
     */
    name: "Non-Compliant records — August 2026",
    scope: {
      kind: "filtered",
      filters: {
        categories: [],
        complianceStatuses: ["Non-Compliant"],
        regions: [],
        manufacturers: [],
        sources: [],
        violationCategoryIds: [],
        batchIds: [],
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
      },
    },
    /*
     * Was ["XLSX", "PDF"]. XLSX left `REPORT_FORMATS` when the build settled on
     * PDF + DOCX, and a history row offering a format the download route cannot
     * render is a 404 waiting to happen.
     */
    formats: ["PDF", "DOCX"],
    generatedAt: "2026-09-01T09:15:00+05:30",
    generatedByUserId: "usr-002",
    generatedByUserName: "Sunita Iyer",
    referenceCode: "LMCS-RPT-5003-42B9",
    rowCount: 5,
    recordIds: ["rec-1002", "rec-1004", "rec-1005", "rec-1008", "rec-1009"],
  },
];

/**
 * A-12 / WCAG 1.3.1: a linked PDF must be tagged accessible, so the UI can warn
 * rather than link an untagged document as though it were fine.
 *
 * All false, and honestly so: jsPDF emits no `/StructTreeRoot`, so nothing this
 * app generates is a tagged PDF today. Claiming otherwise here would have made
 * the warning path dead code and the accessibility gap invisible.
 */
export const MOCK_REPORT_ACCESSIBILITY: Record<string, ReportAccessibility> = {
  "rpt-5001": { pdfIsTagged: false },
  "rpt-5002": { pdfIsTagged: false },
  "rpt-5003": { pdfIsTagged: false },
};
