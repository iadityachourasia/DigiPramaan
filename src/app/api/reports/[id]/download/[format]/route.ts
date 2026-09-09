import { NextResponse } from "next/server";

import { buildReportDocument, renderDocx, renderPdf } from "@/lib/server/report-render";
import { getReportForViewer, resolveReportContentRecords } from "@/lib/server/report-store";
import { REPORT_FORMAT_FILE, REPORT_FORMATS, type ReportFormat } from "@/types";

/**
 * GET /api/reports/[id]/download/[format] — the real file.
 *
 * Re-renders from the stored scope on every request rather than serving a
 * saved file. That is what makes 10 §6's "re-download without regeneration"
 * work indefinitely with no file store and no expiry: the user never sees a
 * second progress run, and a history entry from months ago still downloads.
 *
 * The trade-off, stated: a re-download reflects the records as they are
 * *now*, not as they were when first generated. For a live compliance
 * system that is arguably the more useful behaviour, but it is a real
 * difference from a stored artefact.
 *
 * That trade-off is scoped through the *generating* user's own visibility
 * (`resolveReportContentRecords`), never the downloading viewer's — the
 * same report id must produce the same file for whoever is authorized to
 * download it, not a different one per reader. Authorization itself — is
 * this viewer even allowed to download it — is the separate, frozen-scope
 * check in `getReportForViewer`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; format: string }> }
) {
  const { id, format } = await params;

  const upper = format.toUpperCase() as ReportFormat;
  if (!REPORT_FORMATS.includes(upper)) {
    return NextResponse.json({ error: `Unsupported format: ${format}` }, { status: 400 });
  }

  const viewerId = new URL(request.url).searchParams.get("viewerId") ?? undefined;
  const { report, blocked } = getReportForViewer(id, viewerId);
  if (blocked) {
    return NextResponse.json(
      { error: "Report not found or outside your jurisdiction" },
      { status: 403 }
    );
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (!report.formats.includes(upper)) {
    return NextResponse.json(
      { error: `This report was not generated as ${upper}` },
      { status: 404 }
    );
  }

  const records = resolveReportContentRecords(report);
  const origin = new URL(request.url).origin;
  const doc = buildReportDocument(report, records, origin);

  const { extension, mimeType } = REPORT_FORMAT_FILE[upper];
  const body = upper === "PDF" ? await renderPdf(doc) : await renderDocx(doc);
  const fileName = `${report.id}-${report.referenceCode}.${extension}`;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(body.length),
    },
  });
}
