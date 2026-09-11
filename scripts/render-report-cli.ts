/**
 * render-report-cli.ts — Phase 13's Python-to-Node bridge for the
 * Advanced Regulatory Report. Reuses renderPdfV2()/renderDocxV2() from
 * src/lib/server/report-render-v2 — this file adds no rendering logic of
 * its own, only stdin/stdout plumbing.
 *
 * Deliberately separate from the ORIGINAL render-report-cli.ts contract
 * this file replaces (which called System B's report-render.ts): that
 * renderer stays completely untouched for System B's own mock-data
 * reports, since it never receives real evidence-image file paths and
 * has no way to consume this new contract.
 *
 * Invoked as: npx tsx scripts/render-report-cli.ts < input.json
 * `input.json` is a RenderReportInputV2 ({ snapshot, images, logoPath }).
 * Writes {"pdfBase64": "...", "docxBase64": "..."} to stdout.
 */

import { renderDocxV2, renderPdfV2 } from "@/lib/server/report-render-v2";
import type { RenderReportInputV2 } from "@/types/report-v2";

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
  const raw = await readStdin();
  const input = JSON.parse(raw) as RenderReportInputV2;
  const [pdf, docx] = await Promise.all([renderPdfV2(input), renderDocxV2(input)]);
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
