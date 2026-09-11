/**
 * report-render-v2/pdf.ts — renderPdfV2(), the Advanced Regulatory Report
 * PDF. jsPDF, same library the existing (System B) renderer uses — no new
 * dependency, no headless-browser/HTML-to-PDF approach.
 *
 * Structured as one function per report section (cover, executive
 * summary, product/inspection, responsible entities, original evidence,
 * compliance checklist, violation detail, Rule 7/8/9, barcode, officer
 * verification, digital integrity), each called in order against a
 * shared mutable cursor context — this is the "one function per section,
 * reviewable" requirement, applied within a single file because jsPDF's
 * page-break/cursor state (`ctx.y`, current page) has to be threaded
 * through every section in sequence regardless of file boundaries.
 *
 * A section with no data for this record returns without drawing
 * anything — the uniform conditional-section mechanism (no barcode
 * detected -> no barcode section, no violations -> a one-line "No
 * confirmed violations." instead of a heading with nothing under it).
 *
 * Purely a rendering layer: takes the already-frozen snapshot and
 * already-fetched/optimized local image paths, does no DB/B2/business
 * logic of its own.
 */

import fs from "node:fs";

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

import type {
  ChecklistRowV2,
  FontMeasurementV2,
  PlacementEvidenceV2,
  ReadabilityEvidenceV2,
  RenderReportInputV2,
  ReportSnapshotV2,
} from "@/types/report-v2";

import { DEPARTMENT, GOVERNMENT, MINISTRY, REPORT_TITLE, STATUS_LABEL, angleLabel, formatDate, scaleBboxToDrawnBox } from "./shared";

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LINE = 14;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

/** Muted, restrained status colors — never neon, per the design brief. */
const STATUS_COLOR: Record<string, [number, number, number]> = {
  PASS: [46, 110, 64],
  FAIL: [153, 45, 45],
  NEEDS_REVIEW: [153, 111, 12],
  INSUFFICIENT_EVIDENCE: [140, 90, 40],
  NOT_APPLICABLE: [110, 110, 110],
};

interface Ctx {
  pdf: jsPDF;
  y: number;
  coverPageDrawn: boolean;
}

function ensureRoom(ctx: Ctx, needed: number): void {
  if (ctx.y + needed <= PAGE_HEIGHT - PAGE_MARGIN) return;
  ctx.pdf.addPage();
  ctx.y = PAGE_MARGIN;
}

function text(ctx: Ctx, value: string, size: number, style: "normal" | "bold" = "normal", color: [number, number, number] = [20, 20, 20]): void {
  ctx.pdf.setFont("helvetica", style);
  ctx.pdf.setFontSize(size);
  ctx.pdf.setTextColor(...color);
  const lines = ctx.pdf.splitTextToSize(value, CONTENT_WIDTH) as string[];
  for (const line of lines) {
    ensureRoom(ctx, LINE);
    ctx.pdf.text(line, PAGE_MARGIN, ctx.y);
    ctx.y += LINE;
  }
}

function rule(ctx: Ctx): void {
  ensureRoom(ctx, 10);
  ctx.pdf.setDrawColor(190);
  ctx.pdf.line(PAGE_MARGIN, ctx.y, PAGE_WIDTH - PAGE_MARGIN, ctx.y);
  ctx.y += 12;
}

function sectionHeading(ctx: Ctx, title: string): void {
  ctx.y += 6;
  ensureRoom(ctx, LINE + 4);
  text(ctx, title.toUpperCase(), 13, "bold", [20, 30, 45]);
  ctx.y += 2;
}

function statusPill(ctx: Ctx, status: string, x: number, y: number): number {
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? [90, 90, 90];
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(9);
  const w = ctx.pdf.getTextWidth(label) + 14;
  ctx.pdf.setDrawColor(...color);
  ctx.pdf.setTextColor(...color);
  ctx.pdf.roundedRect(x, y - 9, w, 14, 3, 3, "S");
  ctx.pdf.text(label, x + 7, y + 1);
  ctx.pdf.setTextColor(20, 20, 20);
  return w;
}

function addImageFit(ctx: Ctx, path: string, maxW: number, maxH: number): { x: number; y: number; w: number; h: number } | null {
  if (!fs.existsSync(path)) return null;
  // A base64 data URL, not the raw Buffer — jsPDF's own image-type
  // sniffing (`getImageFileTypeByImageData`) assumes a real global
  // `Uint8Array`/`String`; under some test runners (vitest's jsdom
  // environment observed to differ from a plain Node process here) a
  // Node `Buffer` fails that check with `t.charCodeAt is not a
  // function`. A data URL string sidesteps the realm mismatch entirely
  // and is the same input shape the QR embedding below already uses
  // successfully.
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(path).toString("base64")}`;
  const props = ctx.pdf.getImageProperties(dataUrl);
  const scale = Math.min(maxW / props.width, maxH / props.height, 1);
  const w = props.width * scale;
  const h = props.height * scale;
  ensureRoom(ctx, h + 8);
  const x = PAGE_MARGIN;
  const y = ctx.y;
  ctx.pdf.addImage(dataUrl, "JPEG", x, y, w, h);
  ctx.pdf.setDrawColor(210);
  ctx.pdf.rect(x, y, w, h);
  ctx.y += h + 8;
  return { x, y, w, h };
}

/** A generic, page-break-aware table: header row (subtle fill) + wrapped
 * body rows. jsPDF ships no table plugin, so this is hand-rolled rather
 * than adding jspdf-autotable as a new dependency for one report. */
function drawTable(ctx: Ctx, columns: { header: string; width: number }[], rows: string[][]): void {
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const scale = CONTENT_WIDTH / totalWidth;
  const widths = columns.map((c) => c.width * scale);

  function rowHeight(cells: string[]): number {
    let maxLines = 1;
    ctx.pdf.setFontSize(9);
    for (let i = 0; i < cells.length; i++) {
      const lines = ctx.pdf.splitTextToSize(cells[i] || "", widths[i]! - 8) as string[];
      maxLines = Math.max(maxLines, lines.length);
    }
    return maxLines * 11 + 8;
  }

  function drawRow(cells: string[], bold: boolean, fill?: [number, number, number]): void {
    const h = rowHeight(cells);
    ensureRoom(ctx, h);
    let x = PAGE_MARGIN;
    if (fill) {
      ctx.pdf.setFillColor(...fill);
      ctx.pdf.rect(PAGE_MARGIN, ctx.y, CONTENT_WIDTH, h, "F");
    }
    ctx.pdf.setDrawColor(210);
    ctx.pdf.rect(PAGE_MARGIN, ctx.y, CONTENT_WIDTH, h, "S");
    ctx.pdf.setFont("helvetica", bold ? "bold" : "normal");
    ctx.pdf.setFontSize(9);
    ctx.pdf.setTextColor(20, 20, 20);
    for (let i = 0; i < cells.length; i++) {
      const lines = ctx.pdf.splitTextToSize(cells[i] || "", widths[i]! - 8) as string[];
      lines.forEach((line, lineIdx) => {
        ctx.pdf.text(line, x + 4, ctx.y + 12 + lineIdx * 11);
      });
      x += widths[i]!;
    }
    ctx.y += h;
  }

  drawRow(columns.map((c) => c.header), true, [235, 238, 242]);
  for (const row of rows) drawRow(row, false);
  ctx.y += 6;
}

// ─── Cover ───

async function renderCover(ctx: Ctx, snapshot: ReportSnapshotV2, logoPath: string): Promise<void> {
  ctx.y = PAGE_MARGIN;
  const logoBox = addImageFit(ctx, logoPath, 90, 90);
  if (logoBox) ctx.y = logoBox.y + logoBox.h + 12;

  text(ctx, GOVERNMENT, 9, "normal", [90, 90, 90]);
  text(ctx, `${MINISTRY} · ${DEPARTMENT}`, 9, "normal", [90, 90, 90]);
  ctx.y += 10;
  text(ctx, REPORT_TITLE.toUpperCase(), 22, "bold", [20, 30, 45]);
  ctx.y += 6;
  rule(ctx);

  const p = snapshot.product;
  const inspection = snapshot.inspection;
  const manufacturer = snapshot.responsibleEntities.find((e) => e.role === "manufacturer");
  text(ctx, `Product: ${p.productName}`, 12, "bold");
  if (manufacturer?.value) text(ctx, `Manufacturer: ${manufacturer.value}`, 11);
  text(ctx, `Inspection Date: ${formatDate(inspection.scannedAt)}`, 10);
  text(ctx, `Inspection Source: ${inspection.source}`, 10);
  if (inspection.region) text(ctx, `Jurisdiction: ${inspection.region}`, 10);
  ctx.y += 10;

  text(ctx, "OVERALL RESULT", 10, "bold", [90, 90, 90]);
  ctx.y += 4;
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(20);
  const overall = snapshot.overallAssessment.complianceStatus.toUpperCase();
  const overallColor: [number, number, number] =
    overall === "COMPLIANT" ? [46, 110, 64] : overall === "NON-COMPLIANT" ? [153, 45, 45] : [153, 111, 12];
  ctx.pdf.setTextColor(...overallColor);
  ensureRoom(ctx, 28);
  ctx.pdf.text(overall, PAGE_MARGIN, ctx.y);
  ctx.y += 30;
  ctx.pdf.setTextColor(20, 20, 20);

  rule(ctx);
  const qrDataUrl = await QRCode.toDataURL(snapshot.integrity.verifyUrl, { margin: 1, width: 200 });
  ensureRoom(ctx, 80);
  const qrY = ctx.y;
  ctx.pdf.addImage(qrDataUrl, "PNG", PAGE_MARGIN, qrY, 76, 76);
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(9);
  ctx.pdf.setTextColor(90, 90, 90);
  ctx.pdf.text("Scan to verify authenticity", PAGE_MARGIN + 86, qrY + 16);
  ctx.pdf.text(`Report ID: ${snapshot.reportMetadata.reportId}`, PAGE_MARGIN + 86, qrY + 32);
  ctx.pdf.text(`Reference: ${snapshot.reportMetadata.referenceCode}`, PAGE_MARGIN + 86, qrY + 48);
  ctx.y = qrY + 86;
}

// ─── Executive summary ───

function summaryParagraph(snapshot: ReportSnapshotV2): string {
  const confirmed = snapshot.violations.length;
  const needsReview = snapshot.complianceChecklist.filter(
    (r) => r.result === "NEEDS_REVIEW" || r.result === "INSUFFICIENT_EVIDENCE"
  ).length;
  return (
    `The inspected package was evaluated against the configured Legal Metrology rule set ` +
    `using image evidence collected during inspection. The deterministic rule engine identified ` +
    `${confirmed} confirmed violation${confirmed === 1 ? "" : "s"} and ${needsReview} item${needsReview === 1 ? "" : "s"} ` +
    `requiring officer review. The final verified status is ${snapshot.overallAssessment.complianceStatus.toUpperCase()}.`
  );
}

function renderExecutiveSummary(ctx: Ctx, snapshot: ReportSnapshotV2): void {
  ctx.pdf.addPage();
  ctx.y = PAGE_MARGIN;
  sectionHeading(ctx, "Executive Summary");
  text(ctx, summaryParagraph(snapshot), 10);
  ctx.y += 6;

  const a = snapshot.overallAssessment;
  drawTable(
    ctx,
    [
      { header: "Metric", width: 1 },
      { header: "Value", width: 1 },
    ],
    [
      ["Overall Status", a.complianceStatus],
      ["Compliance Score", a.complianceScore !== null ? String(a.complianceScore) : "—"],
      ["Rules Passed", String(snapshot.complianceChecklist.filter((r) => r.result === "PASS").length)],
      ["Confirmed Violations", String(snapshot.violations.length)],
      [
        "Needs Review",
        String(snapshot.complianceChecklist.filter((r) => r.result === "NEEDS_REVIEW").length),
      ],
      [
        "Insufficient Evidence",
        String(snapshot.complianceChecklist.filter((r) => r.result === "INSUFFICIENT_EVIDENCE").length),
      ],
      ["Evidence Images", String(snapshot.originalImages.length)],
    ]
  );
}

// ─── Product & inspection details ───

function renderProductAndInspection(ctx: Ctx, snapshot: ReportSnapshotV2): void {
  sectionHeading(ctx, "Product & Inspection Details");
  const p = snapshot.product;
  const i = snapshot.inspection;
  drawTable(
    ctx,
    [
      { header: "Field", width: 1 },
      { header: "Value", width: 1.4 },
    ],
    [
      ["Product Name", p.productName],
      ["Generic / Common Name", p.genericName ?? "—"],
      ["Category", p.category ?? "—"],
      ["Net Quantity", p.netQuantity ?? "—"],
      ["MRP", p.mrp ?? "—"],
      ["Country of Origin", p.countryOfOrigin ?? "—"],
      ["Inspection Date/Time", formatDate(i.scannedAt)],
      ["Inspection Source", i.source],
      ["Jurisdiction / Region", i.region ?? "—"],
    ]
  );
}

// ─── Responsible entities ───

function renderResponsibleEntities(ctx: Ctx, snapshot: ReportSnapshotV2): void {
  if (snapshot.responsibleEntities.length === 0) return;
  sectionHeading(ctx, "Responsible Entities");
  drawTable(
    ctx,
    [
      { header: "Role", width: 0.8 },
      { header: "Entity Name", width: 1.4 },
      { header: "Status", width: 0.8 },
    ],
    snapshot.responsibleEntities.map((e) => [
      e.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      e.value ?? "Not detected",
      e.corrected ? "Officer-corrected" : e.notDetected ? "Not detected" : "As extracted",
    ])
  );
}

// ─── Original evidence images ───

function renderOriginalImages(
  ctx: Ctx,
  snapshot: ReportSnapshotV2,
  images: RenderReportInputV2["images"]
): void {
  if (snapshot.originalImages.length === 0) return;
  sectionHeading(ctx, "Original Inspection Evidence");
  const pathByAngle: Record<string, string | null> = {
    front: images.front,
    back: images.back,
    side_pdp: images.side_pdp,
  };
  for (const ref of snapshot.originalImages) {
    const path = pathByAngle[ref.angle];
    text(ctx, angleLabel(ref.angle), 11, "bold");
    if (path) {
      addImageFit(ctx, path, 280, 320);
    } else {
      text(ctx, "(Image unavailable)", 9, "normal", [140, 90, 40]);
    }
    text(
      ctx,
      `Evidence ID: ${ref.imageId}   Captured: ${formatDate(ref.uploadedAt)}   Quality: ${ref.qualityVerdict ?? "—"}`,
      8,
      "normal",
      [110, 110, 110]
    );
    ctx.y += 6;
  }
}

// ─── Compliance checklist ───

function renderComplianceChecklist(ctx: Ctx, checklist: ChecklistRowV2[]): void {
  if (checklist.length === 0) return;
  sectionHeading(ctx, "Legal Compliance Checklist");
  drawTable(
    ctx,
    [
      { header: "Rule", width: 0.6 },
      { header: "Requirement", width: 1.3 },
      { header: "Observed", width: 1.0 },
      { header: "Result", width: 0.6 },
    ],
    checklist.map((row) => [
      row.ruleId,
      row.requirement,
      row.observedValue ?? row.evidenceNote ?? "—",
      STATUS_LABEL[row.result] ?? row.result,
    ])
  );
}

// ─── Violation details ───

function renderViolations(
  ctx: Ctx,
  snapshot: ReportSnapshotV2,
  images: RenderReportInputV2["images"]
): void {
  sectionHeading(ctx, "Violation Details");
  if (snapshot.violations.length === 0) {
    text(ctx, "No confirmed violations.", 10);
    return;
  }
  const pathByAngle: Record<string, string | null> = {
    front: images.front,
    back: images.back,
    side_pdp: images.side_pdp,
  };

  snapshot.violations.forEach((v, index) => {
    ctx.y += 6;
    text(ctx, `VIOLATION ${String(index + 1).padStart(2, "0")}`, 11, "bold", [153, 45, 45]);
    ensureRoom(ctx, 14);
    statusPill(ctx, v.result, PAGE_MARGIN, ctx.y + 6);
    ctx.y += 18;
    text(ctx, `Rule: ${v.ruleId ?? "—"}`, 9);
    text(ctx, `Legal Basis: ${v.legalBasis}`, 9);
    text(ctx, `Category: ${v.category}`, 9);
    if (v.detail) text(ctx, `Deterministic Finding: ${v.detail}`, 9);

    const cropPath = v.cropImageRef ? images.violationCrops[v.cropImageRef] : undefined;
    const originalPath = v.originalImage ? pathByAngle[v.originalImage.angle] : undefined;

    if (originalPath) {
      text(ctx, "Original Evidence", 9, "bold", [90, 90, 90]);
      const box = addImageFit(ctx, originalPath, 220, 220);
      if (box && v.bbox && v.originalImage) {
        const scaled = scaleBboxToDrawnBox(
          v.bbox, v.originalImage.imageWidthPx, v.originalImage.imageHeightPx,
          box.x, box.y, box.w, box.h
        );
        if (scaled) {
          ctx.pdf.setDrawColor(153, 45, 45);
          ctx.pdf.setLineWidth(1.2);
          ctx.pdf.rect(scaled.x, scaled.y, scaled.w, scaled.h);
          ctx.pdf.setLineWidth(0.2);
        }
      }
    }
    if (cropPath) {
      text(ctx, "Focused Evidence", 9, "bold", [90, 90, 90]);
      addImageFit(ctx, cropPath, 180, 180);
    }

    if (v.aiExplanation) {
      ensureRoom(ctx, 40);
      const boxTop = ctx.y;
      text(ctx, v.aiExplanationLabel.toUpperCase(), 8, "bold", [90, 90, 90]);
      text(ctx, v.aiExplanation.summary, 9);
      if (v.aiExplanation.officerGuidance) {
        text(ctx, `Officer guidance: ${v.aiExplanation.officerGuidance}`, 9);
      }
      ctx.pdf.setDrawColor(220);
      ctx.pdf.rect(PAGE_MARGIN - 4, boxTop - 4, CONTENT_WIDTH + 8, ctx.y - boxTop + 4, "S");
      ctx.y += 6;
    }
    rule(ctx);
  });
}

// ─── Rule 7 — physical character height ───

function renderFontMeasurements(
  ctx: Ctx,
  measurements: FontMeasurementV2[],
  images: RenderReportInputV2["images"]
): void {
  if (measurements.length === 0) return;
  sectionHeading(ctx, "Physical Character Height Assessment");
  for (const m of measurements) {
    ensureRoom(ctx, 16);
    statusPill(ctx, m.result, PAGE_MARGIN, ctx.y + 6);
    ctx.y += 18;
    text(ctx, `Declaration measured: ${m.fieldId ?? "—"}`, 9);
    text(ctx, `Measured height: ${m.measuredHeightMm !== null ? `${m.measuredHeightMm.toFixed(2)} mm` : "—"}`, 9);
    text(ctx, `Measurement confidence: ${m.confidence !== null ? `${Math.round(m.confidence * 100)}%` : "—"}`, 9);
    text(ctx, `Calibration method: ${m.calibrationMethod ?? "—"}`, 9);
    text(ctx, `Reference dimension: ${m.knownDimensionMm !== null ? `${m.knownDimensionMm} mm` : "—"}`, 9);
    text(ctx, `Pixels/mm: ${m.pixelsPerMm !== null ? m.pixelsPerMm.toFixed(2) : "—"}`, 9);
    // Deliberately no printed "required threshold" line — the applicable
    // statutory figure is not legally validated (see message below), so
    // this section structurally never states one as authoritative.
    text(ctx, m.insufficientLegalValidationMessage, 9, "bold", [153, 111, 12]);
    if (m.imageId) {
      const path = images.front || images.back || images.side_pdp;
      if (path) addImageFit(ctx, path, 220, 220);
    }
    ctx.y += 4;
    rule(ctx);
  }
}

// ─── Rule 8 — PDP placement ───

function renderPlacementEvidence(ctx: Ctx, rows: PlacementEvidenceV2[]): void {
  if (rows.length === 0) return;
  sectionHeading(ctx, "Principal Display Panel Placement");
  for (const r of rows) {
    ensureRoom(ctx, 16);
    statusPill(ctx, r.result, PAGE_MARGIN, ctx.y + 6);
    ctx.y += 18;
    text(ctx, `Expected: Declaration should appear on the applicable Principal Display Panel.`, 9);
    text(ctx, `Observed panel: ${r.observedPanel ?? "—"}`, 9);
    if (r.reason) text(ctx, `Reason: ${r.reason}`, 9);
    ctx.y += 4;
    rule(ctx);
  }
}

// ─── Rule 9 — readability ───

function renderReadabilityEvidence(ctx: Ctx, rows: ReadabilityEvidenceV2[]): void {
  if (rows.length === 0) return;
  sectionHeading(ctx, "Readability Assessment");
  for (const r of rows) {
    ensureRoom(ctx, 16);
    statusPill(ctx, r.result, PAGE_MARGIN, ctx.y + 6);
    ctx.y += 18;
    if (r.languageDetected) text(ctx, `Language detected: ${r.languageDetected} (${r.languageOk ? "acceptable" : "not acceptable"})`, 9);
    for (const f of r.fields) {
      text(ctx, `${f.field}: OCR confidence ${f.ocrConfidence !== null ? `${f.ocrConfidence.toFixed(0)}%` : "—"} — ${f.status}`, 9);
    }
    ctx.y += 4;
    rule(ctx);
  }
}

// ─── Barcode ───

function renderBarcodeEvidence(
  ctx: Ctx,
  snapshot: ReportSnapshotV2,
  images: RenderReportInputV2["images"]
): void {
  const b = snapshot.barcodeEvidence;
  if (!b) return;
  sectionHeading(ctx, "Product Identifier / Barcode Evidence");
  if (b.status === "needs_review") {
    text(ctx, "Multiple valid identifiers were detected — this report does not select one.", 9, "bold", [153, 111, 12]);
  }
  const candidates = b.trustedIdentifier ? [b.trustedIdentifier] : b.candidates;
  for (const c of candidates) {
    text(ctx, `Symbology: ${c.symbology}`, 9);
    text(ctx, `Detected: ${c.rawValue}    Normalized GTIN: ${c.normalizedValue}`, 9);
    text(ctx, `Checksum: ${c.checksumValid ? "VALID" : "INVALID"}`, 9);
    text(ctx, `Source: ${angleLabel(c.sourceAngle)}    Decoder: ${c.decoder}`, 9);
    ctx.y += 4;
  }
  text(
    ctx,
    "Barcode/GTIN is treated as package evidence and product identity evidence, not as a statutory " +
      "legal declaration unless explicitly required by the applicable rule set.",
    8,
    "normal",
    [110, 110, 110]
  );
  const anyImagePath = images.front || images.back || images.side_pdp;
  if (anyImagePath) addImageFit(ctx, anyImagePath, 220, 220);
  rule(ctx);
}

// ─── Officer verification ───

function renderOfficerVerification(ctx: Ctx, snapshot: ReportSnapshotV2): void {
  sectionHeading(ctx, "Officer Verification");
  const v = snapshot.officerVerification;
  text(ctx, `Verified By: ${v.verifiedByName} (${v.verifiedByRole})`, 10);
  text(ctx, `Jurisdiction: ${v.verifiedByRegion ?? "—"}`, 10);
  text(ctx, `Verification Date/Time: ${formatDate(v.verifiedAt)}`, 10);
  text(ctx, `Final Status: ${v.finalStatus}`, 10, "bold");
  if (v.resolutions.length > 0) {
    ctx.y += 4;
    text(ctx, "Officer Rule Resolutions:", 10, "bold");
    for (const res of v.resolutions) {
      text(ctx, `• ${res.requirement} → ${res.resolvedStatus}: ${res.note}`, 9);
    }
  }
  ctx.y += 6;
  ensureRoom(ctx, 40);
  const boxTop = ctx.y;
  text(ctx, v.governanceStatement, 8, "normal", [90, 90, 90]);
  ctx.pdf.setDrawColor(220);
  ctx.pdf.rect(PAGE_MARGIN - 4, boxTop - 4, CONTENT_WIDTH + 8, ctx.y - boxTop + 4, "S");
}

// ─── Digital integrity ───

async function renderDigitalIntegrity(ctx: Ctx, snapshot: ReportSnapshotV2): Promise<void> {
  sectionHeading(ctx, "Digital Integrity & Authenticity");
  const i = snapshot.integrity;
  text(ctx, `Report ID: ${i.reportId}`, 9);
  text(ctx, `Inspection ID: ${i.inspectionId}`, 9);
  text(ctx, `Generated At: ${formatDate(i.generatedAt)}`, 9);
  text(ctx, `Generated By: ${i.generatedByName}`, 9);
  text(ctx, `Report Format Version: ${i.reportFormatVersion}`, 9);
  text(ctx, `Rule Set Version: ${i.ruleSetVersion}`, 9);
  if (i.pdfSha256) text(ctx, `PDF SHA-256: ${i.pdfSha256}`, 8, "normal", [110, 110, 110]);
  ctx.y += 6;
  const qrDataUrl = await QRCode.toDataURL(i.verifyUrl, { margin: 1, width: 180 });
  ensureRoom(ctx, 76);
  ctx.pdf.addImage(qrDataUrl, "PNG", PAGE_MARGIN, ctx.y, 70, 70);
  ctx.pdf.setFontSize(9);
  ctx.pdf.setTextColor(90, 90, 90);
  ctx.pdf.text("Scan to verify this report's authenticity online.", PAGE_MARGIN + 80, ctx.y + 20);
  ctx.pdf.text(i.verifyUrl, PAGE_MARGIN + 80, ctx.y + 36);
  ctx.y += 84;
  ctx.pdf.setTextColor(20, 20, 20);
}

// ─── Header/footer (post-render pass) ───

function applyHeaderFooter(pdf: jsPDF, reportId: string, inspectionId: string): void {
  const totalPages = pdf.getNumberOfPages();
  for (let page = 2; page <= totalPages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`DigiPramaan | ${REPORT_TITLE}`, PAGE_MARGIN, 28);
    pdf.setDrawColor(220);
    pdf.line(PAGE_MARGIN, 34, PAGE_WIDTH - PAGE_MARGIN, 34);

    pdf.text(
      `Report ${reportId.slice(0, 8)}… · Inspection ${inspectionId.slice(0, 8)}… · Page ${page} of ${totalPages}`,
      PAGE_MARGIN,
      PAGE_HEIGHT - 24
    );
  }
}

export async function renderPdfV2(input: RenderReportInputV2): Promise<Buffer> {
  const { snapshot, images, logoPath } = input;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const ctx: Ctx = { pdf, y: PAGE_MARGIN, coverPageDrawn: false };

  await renderCover(ctx, snapshot, logoPath);
  renderExecutiveSummary(ctx, snapshot);
  renderProductAndInspection(ctx, snapshot);
  renderResponsibleEntities(ctx, snapshot);
  renderOriginalImages(ctx, snapshot, images);
  renderComplianceChecklist(ctx, snapshot.complianceChecklist);
  renderViolations(ctx, snapshot, images);
  renderFontMeasurements(ctx, snapshot.fontMeasurements, images);
  renderPlacementEvidence(ctx, snapshot.placementEvidence);
  renderReadabilityEvidence(ctx, snapshot.readabilityEvidence);
  renderBarcodeEvidence(ctx, snapshot, images);
  renderOfficerVerification(ctx, snapshot);
  await renderDigitalIntegrity(ctx, snapshot);

  applyHeaderFooter(pdf, snapshot.reportMetadata.reportId, snapshot.inspection.inspectionId);

  return Buffer.from(pdf.output("arraybuffer"));
}
