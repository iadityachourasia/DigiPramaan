import { NextResponse } from "next/server";

import { buildReportDocument } from "@/lib/server/report-render";
import { getReport, resolveScopeRecords } from "@/lib/server/report-store";

/**
 * GET /api/reports/[id] — one report plus its fully assembled document.
 *
 * The document is what the in-browser preview renders (13 §2), built by the
 * same `buildReportDocument()` the PDF and DOCX read, so the preview cannot
 * drift from what actually downloads.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const records = resolveScopeRecords(report.scope);
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    report,
    document: buildReportDocument(report, records, origin),
    /*
     * jsPDF emits no /StructTreeRoot, so nothing this app generates is a
     * tagged PDF. Reported honestly so the UI can warn (A-12 / WCAG 1.3.1)
     * rather than link an untagged document as though it were fine.
     */
    accessibility: { pdfIsTagged: false },
  });
}
