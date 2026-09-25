/**
 * report-render-v2/pdf.ts — renderPdfV2(), the Advanced Regulatory Report
 * PDF. jsPDF, same library the existing (System B) renderer uses — no new
 * dependency, no headless-browser/HTML-to-PDF approach.
 *
 * Structured as one function per report section (cover, table of contents,
 * executive summary, declared particulars, product/inspection, responsible
 * entities, packaging gallery, compliance checklist, violation detail,
 * Rule 7/8/9, barcode, officer verification, digital integrity), each
 * called in order against a shared mutable cursor context — this is the
 * "one function per section, reviewable" requirement, applied within a
 * single file because jsPDF's page-break/cursor state (`ctx.y`, current
 * page) has to be threaded through every section in sequence regardless
 * of file boundaries.
 *
 * A section with no data for this record returns without drawing
 * anything — the uniform conditional-section mechanism (no barcode
 * detected -> no barcode section, no violations -> a one-line "No
 * confirmed violations." instead of a heading with nothing under it).
 *
 * Purely a rendering layer: takes the already-frozen snapshot and
 * already-fetched/optimized local image paths, does no DB/B2/business
 * logic of its own.
 *
 * Table of contents: jsPDF has no native TOC support, so this uses a
 * two-pass technique — a blank page is reserved right after the cover,
 * `sectionHeading()` records each section's title + starting page number
 * as it renders, and once every section is drawn, `renderTableOfContents`
 * calls `pdf.setPage()` to go back and fill in the reserved page. Each
 * jsPDF page keeps its own independent content stream, so drawing on an
 * earlier page after later pages already have content is safe.
 */

import fs from "node:fs";
import path from "node:path";

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

import type {
  BarcodeCandidateV2,
  ChecklistRowV2,
  DeclarationRowV2,
  FontMeasurementV2,
  ImageReferenceV2,
  PlacementEvidenceV2,
  ReadabilityEvidenceV2,
  RenderReportInputV2,
  ReportSnapshotV2,
} from "@/types/report-v2";

import {
  FONT_FILES,
  GOVERNMENT,
  MINISTRY,
  PALETTE,
  REPORT_TITLE,
  SPACE,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_SCALE,
  angleLabel,
  declarationEvidenceLabel,
  declarationStatusLabel,
  formatDate,
  groupImagesByAngle,
  scaleBboxToDrawnBox,
} from "./shared";

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LINE = 14;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BORDER_INSET = 18;

type FontFamily = "Inter" | "SourceSerif";

interface TocEntry {
  title: string;
  page: number;
}

interface Ctx {
  pdf: jsPDF;
  y: number;
  tocEntries: TocEntry[];
}

// ─── Fonts ───

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "report");

/** Registers the embeddable Inter/Source Serif weights this render needs
 * (regular + bold of each family — every existing call site only ever
 * asks for "normal" or "bold"). Real jsPDF font embedding via
 * addFileToVFS/addFont, not just a name reference — readers see the
 * actual vendored glyphs regardless of what's installed locally. */
function registerFonts(pdf: jsPDF): void {
  const entries: [file: string, id: string, style: "normal" | "bold"][] = [
    [FONT_FILES.interRegular, "Inter", "normal"],
    [FONT_FILES.interBold, "Inter", "bold"],
    [FONT_FILES.serifRegular, "SourceSerif", "normal"],
    [FONT_FILES.serifBold, "SourceSerif", "bold"],
  ];
  for (const [file, id, style] of entries) {
    const base64 = fs.readFileSync(path.join(FONT_DIR, file)).toString("base64");
    pdf.addFileToVFS(file, base64);
    pdf.addFont(file, id, style);
  }
}

// ─── Low-level drawing helpers ───

function ensureRoom(ctx: Ctx, needed: number): void {
  if (ctx.y + needed <= PAGE_HEIGHT - PAGE_MARGIN) return;
  ctx.pdf.addPage();
  ctx.y = PAGE_MARGIN;
}

function text(
  ctx: Ctx,
  value: string,
  size: number,
  style: "normal" | "bold" = "normal",
  color: [number, number, number] = PALETTE.ink.rgb,
  fontFamily: FontFamily = "Inter"
): void {
  ctx.pdf.setFont(fontFamily, style);
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
  ctx.pdf.setDrawColor(...PALETTE.hairline.rgb);
  ctx.pdf.line(PAGE_MARGIN, ctx.y, PAGE_WIDTH - PAGE_MARGIN, ctx.y);
  ctx.y += 12;
}

/** Section heading with a gold accent bar and a Table-of-Contents entry.
 * Recording the TOC entry here (rather than at each section function's
 * own entry point) is correct even when a section continues on whatever
 * page the previous one left `ctx.y` on — `getNumberOfPages()` reflects
 * the current page at the moment the heading is actually drawn. */
function sectionHeading(ctx: Ctx, title: string): void {
  ctx.y += SPACE.sm;
  ensureRoom(ctx, LINE + 6);
  ctx.tocEntries.push({ title, page: ctx.pdf.getNumberOfPages() });
  ctx.pdf.setFillColor(...PALETTE.accentGold.rgb);
  ctx.pdf.rect(PAGE_MARGIN - 8, ctx.y - 2, 3, LINE + 2, "F");
  text(ctx, title.toUpperCase(), TYPE_SCALE.h1, "bold", PALETTE.headingNavy.rgb, "SourceSerif");
  ctx.y += 2;
}

/** A filled, colored status badge — replaces the old stroke-only pill. */
function statusPill(ctx: Ctx, status: string, x: number, y: number): number {
  const label = STATUS_LABEL[status] ?? status;
  const c = STATUS_COLOR[status] ?? { rgb: [90, 90, 90] as [number, number, number], bgRgb: [230, 230, 230] as [number, number, number] };
  ctx.pdf.setFont("Inter", "bold");
  ctx.pdf.setFontSize(9);
  const w = ctx.pdf.getTextWidth(label) + 14;
  ctx.pdf.setFillColor(...c.bgRgb);
  ctx.pdf.setDrawColor(...c.rgb);
  ctx.pdf.roundedRect(x, y - 9, w, 14, 3, 3, "FD");
  ctx.pdf.setTextColor(...c.rgb);
  ctx.pdf.text(label, x + 7, y + 1);
  ctx.pdf.setTextColor(...PALETTE.ink.rgb);
  return w;
}

function addImageFit(ctx: Ctx, filePath: string, maxW: number, maxH: number): { x: number; y: number; w: number; h: number } | null {
  if (!fs.existsSync(filePath)) return null;
  // A base64 data URL, not the raw Buffer — jsPDF's own image-type
  // sniffing (`getImageFileTypeByImageData`) assumes a real global
  // `Uint8Array`/`String`; under some test runners (vitest's jsdom
  // environment observed to differ from a plain Node process here) a
  // Node `Buffer` fails that check with `t.charCodeAt is not a
  // function`. A data URL string sidesteps the realm mismatch entirely
  // and is the same input shape the QR embedding below already uses
  // successfully.
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(filePath).toString("base64")}`;
  const props = ctx.pdf.getImageProperties(dataUrl);
  const scale = Math.min(maxW / props.width, maxH / props.height, 1);
  const w = props.width * scale;
  const h = props.height * scale;
  ensureRoom(ctx, h + 8);
  const x = PAGE_MARGIN;
  const y = ctx.y;
  ctx.pdf.addImage(dataUrl, "JPEG", x, y, w, h);
  ctx.pdf.setDrawColor(...PALETTE.hairline.rgb);
  ctx.pdf.rect(x, y, w, h);
  ctx.y += h + 8;
  return { x, y, w, h };
}

/** A generic, page-break-aware table: header row (subtle fill) +
 * alternating zebra-striped body rows. jsPDF ships no table plugin, so
 * this is hand-rolled rather than adding jspdf-autotable as a new
 * dependency for one report. */
function drawTable(ctx: Ctx, columns: { header: string; width: number }[], rows: string[][]): void {
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const scale = CONTENT_WIDTH / totalWidth;
  const widths = columns.map((c) => c.width * scale);

  function rowHeight(cells: string[]): number {
    let maxLines = 1;
    ctx.pdf.setFontSize(TYPE_SCALE.body);
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
    ctx.pdf.setDrawColor(...PALETTE.hairline.rgb);
    ctx.pdf.rect(PAGE_MARGIN, ctx.y, CONTENT_WIDTH, h, "S");
    ctx.pdf.setFont("Inter", bold ? "bold" : "normal");
    ctx.pdf.setFontSize(TYPE_SCALE.body);
    ctx.pdf.setTextColor(...PALETTE.ink.rgb);
    for (let i = 0; i < cells.length; i++) {
      const lines = ctx.pdf.splitTextToSize(cells[i] || "", widths[i]! - 8) as string[];
      lines.forEach((line, lineIdx) => {
        ctx.pdf.text(line, x + 4, ctx.y + 12 + lineIdx * 11);
      });
      x += widths[i]!;
    }
    ctx.y += h;
  }

  drawRow(columns.map((c) => c.header), true, PALETTE.headerFill.rgb);
  rows.forEach((row, i) => drawRow(row, false, i % 2 === 0 ? PALETTE.zebraFill.rgb : undefined));
  ctx.y += SPACE.sm;
}

/** A 2-column image grid — used by the packaging gallery, where a record
 * can carry anywhere from 1 to 15+ images. Each pair's row height is
 * measured before anything is drawn, so `ensureRoom` can page-break
 * ahead of the row rather than splitting an image across pages. */
function drawImageGrid(ctx: Ctx, items: { path: string | null; caption: string }[]): void {
  const gap = 12;
  const cellW = (CONTENT_WIDTH - gap) / 2;
  const cellMaxH = 200;

  interface Measured {
    dataUrl: string | null;
    imgW: number;
    imgH: number;
    captionLines: string[];
    h: number;
  }

  function measure(item: { path: string | null; caption: string }): Measured {
    let dataUrl: string | null = null;
    let imgW = 0;
    let imgH = 0;
    if (item.path && fs.existsSync(item.path)) {
      dataUrl = `data:image/jpeg;base64,${fs.readFileSync(item.path).toString("base64")}`;
      const props = ctx.pdf.getImageProperties(dataUrl);
      const scale = Math.min(cellW / props.width, cellMaxH / props.height, 1);
      imgW = props.width * scale;
      imgH = props.height * scale;
    }
    ctx.pdf.setFontSize(TYPE_SCALE.micro);
    const captionLines = ctx.pdf.splitTextToSize(item.caption, cellW) as string[];
    const bodyH = dataUrl ? imgH + 4 : 18;
    return { dataUrl, imgW, imgH, captionLines, h: bodyH + captionLines.length * 10 + 4 };
  }

  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const measures = pair.map(measure);
    const rowH = Math.max(...measures.map((m) => m.h));
    ensureRoom(ctx, rowH + gap);
    const rowTop = ctx.y;
    pair.forEach((_item, col) => {
      const m = measures[col]!;
      const cellX = PAGE_MARGIN + col * (cellW + gap);
      let cellY = rowTop;
      if (m.dataUrl) {
        ctx.pdf.addImage(m.dataUrl, "JPEG", cellX, cellY, m.imgW, m.imgH);
        ctx.pdf.setDrawColor(...PALETTE.hairline.rgb);
        ctx.pdf.rect(cellX, cellY, m.imgW, m.imgH);
        cellY += m.imgH + 4;
      } else {
        ctx.pdf.setFont("Inter", "normal");
        ctx.pdf.setFontSize(TYPE_SCALE.small);
        ctx.pdf.setTextColor(...STATUS_COLOR.INSUFFICIENT_EVIDENCE!.rgb);
        ctx.pdf.text("(Image unavailable)", cellX, cellY + 10);
        cellY += 18;
      }
      ctx.pdf.setFont("Inter", "normal");
      ctx.pdf.setFontSize(TYPE_SCALE.micro);
      ctx.pdf.setTextColor(...PALETTE.subtleText.rgb);
      m.captionLines.forEach((line, li) => ctx.pdf.text(line, cellX, cellY + 8 + li * 10));
    });
    ctx.pdf.setTextColor(...PALETTE.ink.rgb);
    ctx.y = rowTop + rowH + gap;
  }
}

// ─── Cover ───

async function renderCover(ctx: Ctx, snapshot: ReportSnapshotV2, logoPath: string, lockupPath: string): Promise<void> {
  ctx.y = PAGE_MARGIN;

  // Top band: the Consumer Affairs lockup — it already carries the
  // national emblem AND "Department of Consumer Affairs" bilingually, as
  // an official, ready-made mark — beside it, the Government of India /
  // parent-Ministry line supplies the broader context the lockup doesn't
  // spell out (never redrawing the emblem or "Department of Consumer
  // Affairs" a second time, which would just look cluttered). The
  // DigiPramaan logo moves below as a secondary "issuing system" mark.
  const lockupMaxW = 160;
  const lockupMaxH = 60;
  let lockupW = 0;
  let lockupH = 0;
  if (fs.existsSync(lockupPath)) {
    const dataUrl = `data:image/png;base64,${fs.readFileSync(lockupPath).toString("base64")}`;
    const props = ctx.pdf.getImageProperties(dataUrl);
    const scale = Math.min(lockupMaxW / props.width, lockupMaxH / props.height, 1);
    lockupW = props.width * scale;
    lockupH = props.height * scale;
    ctx.pdf.addImage(dataUrl, "PNG", PAGE_MARGIN, ctx.y, lockupW, lockupH);
  }
  const textX = PAGE_MARGIN + lockupMaxW + 16;
  const textMaxWidth = CONTENT_WIDTH - lockupMaxW - 16;
  let textY = ctx.y + Math.max(0, (lockupH - 26) / 2) + 14;
  ctx.pdf.setFont("Inter", "normal");
  ctx.pdf.setFontSize(TYPE_SCALE.small);
  ctx.pdf.setTextColor(...PALETTE.subtleText.rgb);
  ctx.pdf.text(GOVERNMENT.toUpperCase(), textX, textY);
  textY += 16;
  ctx.pdf.setFont("Inter", "bold");
  ctx.pdf.setFontSize(TYPE_SCALE.body);
  ctx.pdf.setTextColor(...PALETTE.headingNavy.rgb);
  const ministryLines = ctx.pdf.splitTextToSize(MINISTRY, textMaxWidth) as string[];
  ministryLines.forEach((line) => {
    ctx.pdf.text(line, textX, textY);
    textY += 13;
  });

  ctx.y += Math.max(lockupH, textY - ctx.y) + SPACE.lg;
  ctx.pdf.setTextColor(...PALETTE.ink.rgb);

  const logoBox = addImageFit(ctx, logoPath, 44, 44);
  if (logoBox) {
    ctx.pdf.setFont("Inter", "normal");
    ctx.pdf.setFontSize(TYPE_SCALE.micro);
    ctx.pdf.setTextColor(...PALETTE.subtleText.rgb);
    ctx.pdf.text(
      "Issued via DigiPramaan — Digital Inspection Record System",
      logoBox.x + logoBox.w + 10,
      logoBox.y + logoBox.h / 2 + 3
    );
    ctx.pdf.setTextColor(...PALETTE.ink.rgb);
  }

  ctx.y += SPACE.md;
  text(ctx, REPORT_TITLE.toUpperCase(), TYPE_SCALE.title, "bold", PALETTE.headingNavy.rgb, "SourceSerif");
  ctx.y += SPACE.sm;
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

  text(ctx, "OVERALL RESULT", 10, "bold", PALETTE.subtleText.rgb);
  ctx.y += 4;
  const overall = snapshot.overallAssessment.complianceStatus.toUpperCase();
  const overallColor =
    overall === "COMPLIANT"
      ? STATUS_COLOR.PASS!.rgb
      : overall === "NON-COMPLIANT"
        ? STATUS_COLOR.FAIL!.rgb
        : STATUS_COLOR.NEEDS_REVIEW!.rgb;
  ensureRoom(ctx, 28);
  ctx.pdf.setFont("SourceSerif", "bold");
  ctx.pdf.setFontSize(20);
  ctx.pdf.setTextColor(...overallColor);
  ctx.pdf.text(overall, PAGE_MARGIN, ctx.y);
  ctx.y += 30;
  ctx.pdf.setTextColor(...PALETTE.ink.rgb);

  rule(ctx);
  const qrDataUrl = await QRCode.toDataURL(snapshot.integrity.verifyUrl, { margin: 1, width: 200 });
  ensureRoom(ctx, 80);
  const qrY = ctx.y;
  ctx.pdf.addImage(qrDataUrl, "PNG", PAGE_MARGIN, qrY, 76, 76);
  ctx.pdf.setFont("Inter", "normal");
  ctx.pdf.setFontSize(9);
  ctx.pdf.setTextColor(...PALETTE.subtleText.rgb);
  ctx.pdf.text("Scan to verify authenticity", PAGE_MARGIN + 86, qrY + 16);
  ctx.pdf.text(`Report ID: ${snapshot.reportMetadata.reportId}`, PAGE_MARGIN + 86, qrY + 32);
  ctx.pdf.text(`Reference: ${snapshot.reportMetadata.referenceCode}`, PAGE_MARGIN + 86, qrY + 48);
  ctx.y = qrY + 86;
}

// ─── Table of contents ───

function renderTableOfContents(pdf: jsPDF, tocPageNumber: number, entries: TocEntry[]): void {
  const finalPage = pdf.getNumberOfPages();
  pdf.setPage(tocPageNumber);
  let y = PAGE_MARGIN;
  pdf.setFont("SourceSerif", "bold");
  pdf.setFontSize(TYPE_SCALE.title * 0.7);
  pdf.setTextColor(...PALETTE.headingNavy.rgb);
  pdf.text("Table of Contents", PAGE_MARGIN, y);
  y += 30;

  for (const entry of entries) {
    if (y > PAGE_HEIGHT - PAGE_MARGIN - LINE) break; // fixed, small section count — practically never hit
    pdf.setFont("Inter", "normal");
    pdf.setFontSize(TYPE_SCALE.body);
    pdf.setTextColor(...PALETTE.ink.rgb);
    const pageStr = String(entry.page);
    const pageStrWidth = pdf.getTextWidth(pageStr);
    const titleWidth = pdf.getTextWidth(entry.title);
    const dotsStartX = PAGE_MARGIN + titleWidth + 4;
    const dotsEndX = PAGE_WIDTH - PAGE_MARGIN - pageStrWidth - 4;
    pdf.text(entry.title, PAGE_MARGIN, y);
    if (dotsEndX > dotsStartX) {
      pdf.setTextColor(...PALETTE.hairline.rgb);
      const dotWidth = pdf.getTextWidth(".");
      const dotsCount = Math.max(0, Math.floor((dotsEndX - dotsStartX) / dotWidth));
      pdf.text(".".repeat(dotsCount), dotsStartX, y);
    }
    pdf.setTextColor(...PALETTE.ink.rgb);
    pdf.text(pageStr, PAGE_WIDTH - PAGE_MARGIN - pageStrWidth, y);
    y += 20;
  }

  pdf.setPage(finalPage);
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

// ─── Declared particulars ───

function renderDeclarations(ctx: Ctx, declarations: DeclarationRowV2[]): void {
  if (declarations.length === 0) return;
  sectionHeading(ctx, "Declared Particulars");
  drawTable(
    ctx,
    [
      { header: "Field", width: 1 },
      { header: "Observed Value", width: 1.5 },
      { header: "Status", width: 0.8 },
      { header: "Evidence", width: 0.9 },
    ],
    declarations.map((d) => [d.label, d.observedValue ?? "—", declarationStatusLabel(d), declarationEvidenceLabel(d)])
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

// ─── Product packaging — complete photographic record ───

function renderPackagingGallery(ctx: Ctx, snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): void {
  if (snapshot.originalImages.length === 0) return;
  sectionHeading(ctx, `Product Packaging — Complete Photographic Record (${snapshot.originalImages.length} images)`);
  const groups = groupImagesByAngle(snapshot.originalImages);
  for (const [angle, refs] of groups) {
    text(ctx, `${angleLabel(angle)} (${refs.length})`, TYPE_SCALE.h3, "bold", PALETTE.headingNavy.rgb);
    ctx.y += 2;
    drawImageGrid(
      ctx,
      refs.map((ref: ImageReferenceV2) => ({
        path: images.byImageId[ref.imageId] ?? null,
        caption: `ID ${ref.imageId.slice(0, 8)} · ${formatDate(ref.uploadedAt)} · Quality: ${ref.qualityVerdict ?? "—"}`,
      }))
    );
    ctx.y += SPACE.sm;
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

function renderViolations(ctx: Ctx, snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): void {
  sectionHeading(ctx, "Violation Details");
  if (snapshot.violations.length === 0) {
    text(ctx, "No confirmed violations.", 10);
    return;
  }

  snapshot.violations.forEach((v, index) => {
    ctx.y += 6;
    text(ctx, `VIOLATION ${String(index + 1).padStart(2, "0")}`, 11, "bold", STATUS_COLOR.FAIL!.rgb);
    ensureRoom(ctx, 14);
    statusPill(ctx, v.result, PAGE_MARGIN, ctx.y + 6);
    ctx.y += 18;
    text(ctx, `Rule: ${v.ruleId ?? "—"}`, 9);
    text(ctx, `Legal Basis: ${v.legalBasis}`, 9);
    text(ctx, `Category: ${v.category}`, 9);
    if (v.detail) text(ctx, `Deterministic Finding: ${v.detail}`, 9);

    const cropPath = v.cropImageRef ? images.violationCrops[v.cropImageRef] : undefined;
    const originalPath = v.originalImage ? images.byImageId[v.originalImage.imageId] : undefined;

    if (originalPath) {
      text(ctx, "Original Evidence", 9, "bold", PALETTE.subtleText.rgb);
      const box = addImageFit(ctx, originalPath, 220, 220);
      if (box && v.bbox && v.originalImage) {
        const scaled = scaleBboxToDrawnBox(
          v.bbox, v.originalImage.imageWidthPx, v.originalImage.imageHeightPx,
          box.x, box.y, box.w, box.h
        );
        if (scaled) {
          ctx.pdf.setDrawColor(...STATUS_COLOR.FAIL!.rgb);
          ctx.pdf.setLineWidth(1.2);
          ctx.pdf.rect(scaled.x, scaled.y, scaled.w, scaled.h);
          ctx.pdf.setLineWidth(0.2);
        }
      }
    }
    if (cropPath) {
      text(ctx, "Focused Evidence", 9, "bold", PALETTE.subtleText.rgb);
      addImageFit(ctx, cropPath, 180, 180);
    }

    if (v.aiExplanation) {
      ensureRoom(ctx, 40);
      const boxTop = ctx.y;
      text(ctx, v.aiExplanationLabel.toUpperCase(), 8, "bold", PALETTE.subtleText.rgb);
      text(ctx, v.aiExplanation.summary, 9);
      if (v.aiExplanation.officerGuidance) {
        text(ctx, `Officer guidance: ${v.aiExplanation.officerGuidance}`, 9);
      }
      ctx.pdf.setDrawColor(...PALETTE.hairline.rgb);
      ctx.pdf.rect(PAGE_MARGIN - 4, boxTop - 4, CONTENT_WIDTH + 8, ctx.y - boxTop + 4, "S");
      ctx.y += 6;
    }
    rule(ctx);
  });
}

// ─── Rule 7 — physical character height ───

function renderFontMeasurements(ctx: Ctx, measurements: FontMeasurementV2[], images: RenderReportInputV2["images"]): void {
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
    text(ctx, m.insufficientLegalValidationMessage, 9, "bold", STATUS_COLOR.NEEDS_REVIEW!.rgb);
    if (m.imageId) {
      const imgPath = images.byImageId[m.imageId];
      if (imgPath) addImageFit(ctx, imgPath, 220, 220);
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

function barcodeSourcePath(b: NonNullable<ReportSnapshotV2["barcodeEvidence"]>, images: RenderReportInputV2["images"]): string | undefined {
  const primary: BarcodeCandidateV2 | undefined = b.trustedIdentifier ?? b.candidates[0];
  return primary ? images.byImageId[primary.sourceImageId] : undefined;
}

function renderBarcodeEvidence(ctx: Ctx, snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): void {
  const b = snapshot.barcodeEvidence;
  if (!b) return;
  sectionHeading(ctx, "Product Identifier / Barcode Evidence");
  if (b.status === "needs_review") {
    text(ctx, "Multiple valid identifiers were detected — this report does not select one.", 9, "bold", STATUS_COLOR.NEEDS_REVIEW!.rgb);
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
    PALETTE.subtleText.rgb
  );
  const sourcePath = barcodeSourcePath(b, images);
  if (sourcePath) addImageFit(ctx, sourcePath, 220, 220);
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
  text(ctx, v.governanceStatement, 8, "normal", PALETTE.subtleText.rgb);
  ctx.pdf.setDrawColor(...PALETTE.hairline.rgb);
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
  if (i.pdfSha256) text(ctx, `PDF SHA-256: ${i.pdfSha256}`, 8, "normal", PALETTE.subtleText.rgb);
  ctx.y += 6;
  const qrDataUrl = await QRCode.toDataURL(i.verifyUrl, { margin: 1, width: 180 });
  ensureRoom(ctx, 76);
  ctx.pdf.addImage(qrDataUrl, "PNG", PAGE_MARGIN, ctx.y, 70, 70);
  ctx.pdf.setFont("Inter", "normal");
  ctx.pdf.setFontSize(9);
  ctx.pdf.setTextColor(...PALETTE.subtleText.rgb);
  ctx.pdf.text("Scan to verify this report's authenticity online.", PAGE_MARGIN + 80, ctx.y + 20);
  ctx.pdf.text(i.verifyUrl, PAGE_MARGIN + 80, ctx.y + 36);
  ctx.y += 84;
  ctx.pdf.setTextColor(...PALETTE.ink.rgb);
}

// ─── Header/footer + page border (post-render passes) ───

function applyHeaderFooter(pdf: jsPDF, reportId: string, inspectionId: string, emblemPath: string): void {
  // A small emblem mark in the header, every page after the cover — the
  // "letterhead" continuity a physical government document has, without
  // redrawing the cover's own (larger) Consumer Affairs lockup a second
  // time. Read once, embedded on every page — cheap, and jsPDF caches
  // identical image data by content, not just by call site.
  let emblemDataUrl: string | null = null;
  let emblemW = 0;
  let emblemH = 0;
  if (fs.existsSync(emblemPath)) {
    emblemDataUrl = `data:image/png;base64,${fs.readFileSync(emblemPath).toString("base64")}`;
    const props = pdf.getImageProperties(emblemDataUrl);
    const scale = Math.min(14 / props.width, 22 / props.height);
    emblemW = props.width * scale;
    emblemH = props.height * scale;
  }

  const totalPages = pdf.getNumberOfPages();
  for (let page = 2; page <= totalPages; page++) {
    pdf.setPage(page);
    if (emblemDataUrl) pdf.addImage(emblemDataUrl, "PNG", PAGE_MARGIN, 16, emblemW, emblemH);
    pdf.setFont("Inter", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...PALETTE.subtleText.rgb);
    pdf.text(`DigiPramaan | ${REPORT_TITLE}`, PAGE_MARGIN + (emblemDataUrl ? emblemW + 6 : 0), 28);
    pdf.setDrawColor(...PALETTE.hairline.rgb);
    pdf.line(PAGE_MARGIN, 34, PAGE_WIDTH - PAGE_MARGIN, 34);

    pdf.text(
      `Report ${reportId.slice(0, 8)}… · Inspection ${inspectionId.slice(0, 8)}… · Page ${page} of ${totalPages}`,
      PAGE_MARGIN,
      PAGE_HEIGHT - 24
    );
  }
}

/** A thin hairline frame on every page — the restrained "official
 * certificate" border treatment. Applied separately from header/footer
 * text since it belongs on the cover too (which has no running header). */
function applyPageBorder(pdf: jsPDF): void {
  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(...PALETTE.hairline.rgb);
    pdf.setLineWidth(0.75);
    pdf.rect(BORDER_INSET, BORDER_INSET, PAGE_WIDTH - BORDER_INSET * 2, PAGE_HEIGHT - BORDER_INSET * 2, "S");
    pdf.setLineWidth(0.2);
  }
}

export async function renderPdfV2(input: RenderReportInputV2): Promise<Buffer> {
  const { snapshot, images, logoPath, emblemPath, lockupPath } = input;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  registerFonts(pdf);
  const ctx: Ctx = { pdf, y: PAGE_MARGIN, tocEntries: [] };

  await renderCover(ctx, snapshot, logoPath, lockupPath);

  pdf.addPage(); // reserved, filled in by renderTableOfContents once every section has recorded its page
  const tocPageNumber = pdf.getNumberOfPages();

  pdf.addPage();
  ctx.y = PAGE_MARGIN;
  renderExecutiveSummary(ctx, snapshot);
  renderDeclarations(ctx, snapshot.declarations);
  renderProductAndInspection(ctx, snapshot);
  renderResponsibleEntities(ctx, snapshot);
  renderPackagingGallery(ctx, snapshot, images);
  renderComplianceChecklist(ctx, snapshot.complianceChecklist);
  renderViolations(ctx, snapshot, images);
  renderFontMeasurements(ctx, snapshot.fontMeasurements, images);
  renderPlacementEvidence(ctx, snapshot.placementEvidence);
  renderReadabilityEvidence(ctx, snapshot.readabilityEvidence);
  renderBarcodeEvidence(ctx, snapshot, images);
  renderOfficerVerification(ctx, snapshot);
  await renderDigitalIntegrity(ctx, snapshot);

  renderTableOfContents(pdf, tocPageNumber, ctx.tocEntries);
  applyHeaderFooter(pdf, snapshot.reportMetadata.reportId, snapshot.inspection.inspectionId, emblemPath);
  applyPageBorder(pdf);

  return Buffer.from(pdf.output("arraybuffer"));
}
