/**
 * render-report-cli.ts — Phase 5's Python-to-Node bridge for immutable
 * reports. Reuses the EXISTING renderPdf()/renderDocx() from
 * src/lib/server/report-render.ts verbatim (jsPDF/docx/qrcode) — this file
 * adds no rendering logic of its own, only stdin/stdout plumbing.
 *
 * report-render.ts's own buildReportDocument()/verifierOf() are skipped on
 * purpose: they resolve attribution through @/lib/mock/users, which has no
 * meaning for a real backend-generated ReportDocument. The backend
 * (app/services/reports/snapshot.py) builds the ReportDocument directly from
 * real data and pipes it in as JSON here.
 *
 * Invoked as: npx tsx scripts/render-report-cli.ts < document.json
 * Writes {"pdfBase64": "...", "docxBase64": "..."} to stdout.
 */

import { renderDocx, renderPdf } from "@/lib/server/report-render";
import type { ReportDocument } from "@/types";

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  const input = await readStdin();
  const doc = JSON.parse(input) as ReportDocument;
  const [pdf, docx] = await Promise.all([renderPdf(doc), renderDocx(doc)]);
  process.stdout.write(
    JSON.stringify({
      pdfBase64: pdf.toString("base64"),
      docxBase64: docx.toString("base64"),
    })
  );
}

main().catch((error: unknown) => {
  process.stderr.write(String(error instanceof Error ? error.stack : error));
  process.exit(1);
});
