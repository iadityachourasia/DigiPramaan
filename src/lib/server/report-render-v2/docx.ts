/**
 * report-render-v2/docx.ts — renderDocxV2(), the Advanced Regulatory
 * Report DOCX. The `docx` npm package, same as System B's existing
 * renderer — real Heading styles, real editable tables, embedded images,
 * never a flattened screenshot. Mirrors pdf.ts's section list so both
 * documents carry the same content in the same order.
 *
 * Fonts: Inter (body) + Source Serif 4 (headings/title), both vendored
 * under public/fonts/report/ (OFL-1.1). `Document({ fonts })` embeds the
 * real glyph data into the .docx's own font table (confirmed via the
 * installed docx@9.7.1 package — this is true OOXML embedding, not just a
 * `<w:rFonts>` name reference), and every heading/title style also
 * declares the font by name for correct rendering with graceful fallback
 * on a reader that doesn't honor the embedded table. `features.
 * updateFields = true` is required so Word actually populates the native
 * TableOfContents field on open, instead of showing it stale/empty until
 * the reader manually updates it.
 */

import fs from "node:fs";
import path from "node:path";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

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
  STATUS_COLOR,
  STATUS_LABEL,
  angleLabel,
  declarationEvidenceLabel,
  declarationStatusLabel,
  fitDimensions,
  formatDate,
  groupImagesByAngle,
} from "./shared";

type Node = Paragraph | Table;

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "report");
const FONT_BODY = "Inter";
const FONT_HEADING = "Source Serif 4";

function loadFont(file: string): Buffer {
  return fs.readFileSync(path.join(FONT_DIR, file));
}

function cell(value: string, bold = false, shadingHex?: string): TableCell {
  return new TableCell({
    ...(shadingHex ? { shading: { type: ShadingType.CLEAR, fill: shadingHex } } : {}),
    children: [new Paragraph({ children: [new TextRun({ text: value, bold })] })],
  });
}

function headerRow(labels: string[]): TableRow {
  return new TableRow({ children: labels.map((l) => cell(l, true, PALETTE.headerFill.hex)) });
}

/** A generic data table — alternating zebra-striped rows, matching
 * drawTable()'s treatment in pdf.ts. */
function table(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      headerRow(headers),
      ...rows.map(
        (r, i) =>
          new TableRow({ children: r.map((v) => cell(v, false, i % 2 === 0 ? PALETTE.zebraFill.hex : undefined)) })
      ),
    ],
  });
}

/** A colored status badge. `docx`'s installed types expose no shape/
 * drawing primitive, so a single-cell borderless, shaded table is the
 * standard OOXML idiom for a colored inline block. */
function statusBadge(status: string): Table {
  const label = STATUS_LABEL[status] ?? status;
  const c = STATUS_COLOR[status] ?? { rgb: [90, 90, 90] as [number, number, number], hex: "5A5A5A", bgRgb: [230, 230, 230] as [number, number, number], bgHex: "E6E6E6" };
  return new Table({
    width: { size: 0, type: WidthType.AUTO },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: c.bgHex },
            children: [
              new Paragraph({ children: [new TextRun({ text: label, bold: true, color: c.hex, size: 16 })] }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** `naturalDims` comes from the Python side (Pillow already knows the
 * post-resize file dimensions when it writes each file) — the DOCX path
 * has no dimension-reading logic of its own, deliberately, to avoid a new
 * dependency for something the producer already knows. Falls back to a
 * square assumption for the fixed report-logo asset, whose real aspect
 * ratio (600x600, confirmed square) is known and stable. */
function imageParagraph(imgPath: string, maxW: number, maxH: number, naturalDims?: [number, number]): Paragraph | null {
  if (!fs.existsSync(imgPath)) return null;
  const buffer = fs.readFileSync(imgPath);
  const [naturalW, naturalH] = naturalDims ?? [1, 1];
  const { width, height } = fitDimensions(naturalW, naturalH, maxW, maxH);
  return new Paragraph({
    children: [
      new ImageRun({
        type: "jpg",
        data: buffer,
        transformation: { width, height },
      }),
    ],
  });
}

function pngParagraph(imgPath: string, maxW: number, maxH: number, naturalDims: [number, number]): Paragraph | null {
  if (!fs.existsSync(imgPath)) return null;
  const buffer = fs.readFileSync(imgPath);
  const { width, height } = fitDimensions(naturalDims[0], naturalDims[1], maxW, maxH);
  return new Paragraph({
    children: [new ImageRun({ type: "png", data: buffer, transformation: { width, height } })],
  });
}

// ─── Cover ───

function buildCover(snapshot: ReportSnapshotV2, logoPath: string, lockupPath: string): Node[] {
  const nodes: Node[] = [];

  // Top band: the Consumer Affairs lockup — it already carries the
  // national emblem AND "Department of Consumer Affairs" bilingually, as
  // an official, ready-made mark, so it isn't redrawn separately here.
  // Government of India / parent-Ministry supplies the broader context
  // the lockup doesn't spell out. The DigiPramaan logo follows as a
  // smaller, secondary "issuing system" mark.
  const lockup = pngParagraph(lockupPath, 220, 76, [618, 204]);
  if (lockup) nodes.push(lockup);
  nodes.push(
    new Paragraph({ children: [new TextRun({ text: GOVERNMENT.toUpperCase(), size: 16, color: PALETTE.subtleText.hex })] }),
    new Paragraph({
      children: [new TextRun({ text: MINISTRY, size: 19, bold: true, color: PALETTE.headingNavy.hex })],
    }),
  );

  const logo = imageParagraph(logoPath, 44, 44, [600, 600]);
  if (logo) nodes.push(logo);
  nodes.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Issued via DigiPramaan — Digital Inspection Record System",
          size: 15,
          italics: true,
          color: PALETTE.subtleText.hex,
        }),
      ],
    })
  );

  nodes.push(new Paragraph({ text: REPORT_TITLE.toUpperCase(), heading: HeadingLevel.TITLE }));

  const p = snapshot.product;
  const manufacturer = snapshot.responsibleEntities.find((e) => e.role === "manufacturer");
  nodes.push(
    new Paragraph({ children: [new TextRun({ text: `Product: ${p.productName}`, bold: true })] }),
  );
  if (manufacturer?.value) nodes.push(new Paragraph({ text: `Manufacturer: ${manufacturer.value}` }));
  nodes.push(
    new Paragraph({ text: `Inspection Date: ${formatDate(snapshot.inspection.scannedAt)}` }),
    new Paragraph({ text: `Inspection Source: ${snapshot.inspection.source}` }),
    new Paragraph({ text: `Jurisdiction: ${snapshot.inspection.region ?? "—"}` }),
    new Paragraph({
      children: [
        new TextRun({ text: "OVERALL RESULT: ", bold: true }),
        new TextRun({
          text: snapshot.overallAssessment.complianceStatus.toUpperCase(),
          bold: true,
          size: 32,
          font: FONT_HEADING,
          color:
            snapshot.overallAssessment.complianceStatus.toUpperCase() === "COMPLIANT"
              ? STATUS_COLOR.PASS!.hex
              : snapshot.overallAssessment.complianceStatus.toUpperCase() === "NON-COMPLIANT"
                ? STATUS_COLOR.FAIL!.hex
                : STATUS_COLOR.NEEDS_REVIEW!.hex,
        }),
      ],
    }),
    new Paragraph({ text: `Report ID: ${snapshot.reportMetadata.reportId}` }),
    new Paragraph({ text: `Reference: ${snapshot.reportMetadata.referenceCode}` }),
    new Paragraph({ text: `Verify at: ${snapshot.integrity.verifyUrl}` }),
  );
  return nodes;
}

// ─── Table of contents ───

function buildTableOfContents(): Node[] {
  return [
    new Paragraph({ text: "Table of Contents", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({ children: [], pageBreakBefore: true }),
  ];
}

// ─── Executive summary ───

function summaryParagraphText(snapshot: ReportSnapshotV2): string {
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

function buildExecutiveSummary(snapshot: ReportSnapshotV2): Node[] {
  const a = snapshot.overallAssessment;
  return [
    new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: summaryParagraphText(snapshot) }),
    table(
      ["Metric", "Value"],
      [
        ["Overall Status", a.complianceStatus],
        ["Compliance Score", a.complianceScore !== null ? String(a.complianceScore) : "—"],
        ["Rules Passed", String(snapshot.complianceChecklist.filter((r) => r.result === "PASS").length)],
        ["Confirmed Violations", String(snapshot.violations.length)],
        ["Needs Review", String(snapshot.complianceChecklist.filter((r) => r.result === "NEEDS_REVIEW").length)],
        [
          "Insufficient Evidence",
          String(snapshot.complianceChecklist.filter((r) => r.result === "INSUFFICIENT_EVIDENCE").length),
        ],
        ["Evidence Images", String(snapshot.originalImages.length)],
      ]
    ),
  ];
}

// ─── Declared particulars ───

function buildDeclarations(declarations: DeclarationRowV2[]): Node[] {
  if (declarations.length === 0) return [];
  return [
    new Paragraph({ text: "Declared Particulars", heading: HeadingLevel.HEADING_1 }),
    table(
      ["Field", "Observed Value", "Status", "Evidence"],
      declarations.map((d) => [d.label, d.observedValue ?? "—", declarationStatusLabel(d), declarationEvidenceLabel(d)])
    ),
  ];
}

// ─── Product & inspection ───

function buildProductAndInspection(snapshot: ReportSnapshotV2): Node[] {
  const p = snapshot.product;
  const i = snapshot.inspection;
  return [
    new Paragraph({ text: "Product & Inspection Details", heading: HeadingLevel.HEADING_1 }),
    table(
      ["Field", "Value"],
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
    ),
  ];
}

// ─── Responsible entities ───

function buildResponsibleEntities(snapshot: ReportSnapshotV2): Node[] {
  if (snapshot.responsibleEntities.length === 0) return [];
  return [
    new Paragraph({ text: "Responsible Entities", heading: HeadingLevel.HEADING_1 }),
    table(
      ["Role", "Entity Name", "Status"],
      snapshot.responsibleEntities.map((e) => [
        e.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        e.value ?? "Not detected",
        e.corrected ? "Officer-corrected" : e.notDetected ? "Not detected" : "As extracted",
      ])
    ),
  ];
}

// ─── Product packaging — complete photographic record ───

function buildPackagingGallery(snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): Node[] {
  if (snapshot.originalImages.length === 0) return [];
  const nodes: Node[] = [
    new Paragraph({
      text: `Product Packaging — Complete Photographic Record (${snapshot.originalImages.length} images)`,
      heading: HeadingLevel.HEADING_1,
    }),
  ];
  const groups = groupImagesByAngle(snapshot.originalImages);
  for (const [angle, refs] of groups) {
    nodes.push(new Paragraph({ text: `${angleLabel(angle)} (${refs.length})`, heading: HeadingLevel.HEADING_3 }));
    nodes.push(buildImageGridTable(refs, images));
  }
  return nodes;
}

/** A borderless 2-column table — the standard `docx` idiom for a flow
 * grid, the same trick `table()` uses for data rows but with ImageRun
 * cells and no header row. Word breaks rows across pages normally. */
function buildImageGridTable(refs: ImageReferenceV2[], images: RenderReportInputV2["images"]): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < refs.length; i += 2) {
    const pair = refs.slice(i, i + 2);
    rows.push(
      new TableRow({
        children: pair.map((ref) => {
          const imgPath = images.byImageId[ref.imageId];
          const dims = images.dimensions[ref.imageId];
          const img = imgPath ? imageParagraph(imgPath, 230, 230, dims) : null;
          const caption = new Paragraph({
            children: [
              new TextRun({
                text: `ID ${ref.imageId.slice(0, 8)} · ${formatDate(ref.uploadedAt)} · Quality: ${ref.qualityVerdict ?? "—"}`,
                size: 14,
                color: PALETTE.subtleText.hex,
              }),
            ],
          });
          return new TableCell({
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            children: [img ?? new Paragraph({ text: "(Image unavailable)" }), caption],
          });
        }),
      })
    );
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// ─── Compliance checklist ───

function buildComplianceChecklist(checklist: ChecklistRowV2[]): Node[] {
  if (checklist.length === 0) return [];
  return [
    new Paragraph({ text: "Legal Compliance Checklist", heading: HeadingLevel.HEADING_1 }),
    table(
      ["Rule", "Requirement", "Observed", "Result"],
      checklist.map((row) => [
        row.ruleId,
        row.requirement,
        row.observedValue ?? row.evidenceNote ?? "—",
        STATUS_LABEL[row.result] ?? row.result,
      ])
    ),
  ];
}

// ─── Violation details ───

function buildViolations(snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): Node[] {
  const nodes: Node[] = [new Paragraph({ text: "Violation Details", heading: HeadingLevel.HEADING_1 })];
  if (snapshot.violations.length === 0) {
    nodes.push(new Paragraph({ text: "No confirmed violations." }));
    return nodes;
  }

  snapshot.violations.forEach((v, index) => {
    nodes.push(
      new Paragraph({ text: `Violation ${String(index + 1).padStart(2, "0")}`, heading: HeadingLevel.HEADING_2 }),
      statusBadge(v.result),
      new Paragraph({ text: `Rule: ${v.ruleId ?? "—"}` }),
      new Paragraph({ text: `Legal Basis: ${v.legalBasis}` }),
      new Paragraph({ text: `Category: ${v.category}` }),
    );
    if (v.detail) nodes.push(new Paragraph({ text: `Deterministic Finding: ${v.detail}` }));

    const originalPath = v.originalImage ? images.byImageId[v.originalImage.imageId] : undefined;
    if (originalPath && v.originalImage) {
      const img = imageParagraph(originalPath, 300, 300, images.dimensions[v.originalImage.imageId]);
      if (img) nodes.push(new Paragraph({ text: "Original Evidence", heading: HeadingLevel.HEADING_3 }), img);
    }
    const cropPath = v.cropImageRef ? images.violationCrops[v.cropImageRef] : undefined;
    if (cropPath && v.cropImageRef) {
      const img = imageParagraph(cropPath, 260, 260, images.dimensions[v.cropImageRef]);
      if (img) nodes.push(new Paragraph({ text: "Focused Evidence", heading: HeadingLevel.HEADING_3 }), img);
    }

    if (v.aiExplanation) {
      nodes.push(
        new Paragraph({
          children: [new TextRun({ text: v.aiExplanationLabel.toUpperCase(), bold: true, size: 16 })],
        }),
        new Paragraph({ text: v.aiExplanation.summary }),
      );
      if (v.aiExplanation.officerGuidance) {
        nodes.push(new Paragraph({ text: `Officer guidance: ${v.aiExplanation.officerGuidance}` }));
      }
    }
  });
  return nodes;
}

// ─── Rule 7 ───

function buildFontMeasurements(measurements: FontMeasurementV2[], images: RenderReportInputV2["images"]): Node[] {
  if (measurements.length === 0) return [];
  const nodes: Node[] = [new Paragraph({ text: "Physical Character Height Assessment", heading: HeadingLevel.HEADING_1 })];
  for (const m of measurements) {
    nodes.push(
      statusBadge(m.result),
      new Paragraph({ text: `Declaration measured: ${m.fieldId ?? "—"}` }),
      new Paragraph({ text: `Measured height: ${m.measuredHeightMm !== null ? `${m.measuredHeightMm.toFixed(2)} mm` : "—"}` }),
      new Paragraph({ text: `Measurement confidence: ${m.confidence !== null ? `${Math.round(m.confidence * 100)}%` : "—"}` }),
      new Paragraph({ text: `Calibration method: ${m.calibrationMethod ?? "—"}` }),
      new Paragraph({ text: `Reference dimension: ${m.knownDimensionMm !== null ? `${m.knownDimensionMm} mm` : "—"}` }),
      new Paragraph({ text: `Pixels/mm: ${m.pixelsPerMm !== null ? m.pixelsPerMm.toFixed(2) : "—"}` }),
      new Paragraph({
        children: [new TextRun({ text: m.insufficientLegalValidationMessage, bold: true, color: STATUS_COLOR.NEEDS_REVIEW!.hex })],
      }),
    );
    if (m.imageId) {
      const imgPath = images.byImageId[m.imageId];
      if (imgPath) {
        const img = imageParagraph(imgPath, 300, 300, images.dimensions[m.imageId]);
        if (img) nodes.push(img);
      }
    }
  }
  return nodes;
}

// ─── Rule 8 ───

function buildPlacementEvidence(rows: PlacementEvidenceV2[]): Node[] {
  if (rows.length === 0) return [];
  const nodes: Node[] = [new Paragraph({ text: "Principal Display Panel Placement", heading: HeadingLevel.HEADING_1 })];
  for (const r of rows) {
    nodes.push(
      statusBadge(r.result),
      new Paragraph({ text: "Expected: Declaration should appear on the applicable Principal Display Panel." }),
      new Paragraph({ text: `Observed panel: ${r.observedPanel ?? "—"}` }),
    );
    if (r.reason) nodes.push(new Paragraph({ text: `Reason: ${r.reason}` }));
  }
  return nodes;
}

// ─── Rule 9 ───

function buildReadabilityEvidence(rows: ReadabilityEvidenceV2[]): Node[] {
  if (rows.length === 0) return [];
  const nodes: Node[] = [new Paragraph({ text: "Readability Assessment", heading: HeadingLevel.HEADING_1 })];
  for (const r of rows) {
    nodes.push(statusBadge(r.result));
    if (r.languageDetected) {
      nodes.push(new Paragraph({ text: `Language detected: ${r.languageDetected} (${r.languageOk ? "acceptable" : "not acceptable"})` }));
    }
    for (const f of r.fields) {
      nodes.push(
        new Paragraph({
          text: `${f.field}: OCR confidence ${f.ocrConfidence !== null ? `${f.ocrConfidence.toFixed(0)}%` : "—"} — ${f.status}`,
        })
      );
    }
  }
  return nodes;
}

// ─── Barcode ───

function barcodeSourceImage(
  b: NonNullable<ReportSnapshotV2["barcodeEvidence"]>,
  images: RenderReportInputV2["images"]
): { path: string; dims: [number, number] | undefined } | null {
  const primary: BarcodeCandidateV2 | undefined = b.trustedIdentifier ?? b.candidates[0];
  if (!primary) return null;
  const path = images.byImageId[primary.sourceImageId];
  if (!path) return null;
  return { path, dims: images.dimensions[primary.sourceImageId] };
}

function buildBarcodeEvidence(snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): Node[] {
  const b = snapshot.barcodeEvidence;
  if (!b) return [];
  const nodes: Node[] = [new Paragraph({ text: "Product Identifier / Barcode Evidence", heading: HeadingLevel.HEADING_1 })];
  if (b.status === "needs_review") {
    nodes.push(new Paragraph({ children: [new TextRun({ text: "Multiple valid identifiers were detected — this report does not select one.", bold: true })] }));
  }
  const candidates = b.trustedIdentifier ? [b.trustedIdentifier] : b.candidates;
  for (const c of candidates) {
    nodes.push(
      new Paragraph({ text: `Symbology: ${c.symbology}` }),
      new Paragraph({ text: `Detected: ${c.rawValue}    Normalized GTIN: ${c.normalizedValue}` }),
      new Paragraph({ text: `Checksum: ${c.checksumValid ? "VALID" : "INVALID"}` }),
      new Paragraph({ text: `Source: ${angleLabel(c.sourceAngle)}    Decoder: ${c.decoder}` }),
    );
  }
  nodes.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Barcode/GTIN is treated as package evidence and product identity evidence, not as a statutory legal declaration unless explicitly required by the applicable rule set.",
          size: 16,
          color: PALETTE.subtleText.hex,
        }),
      ],
    })
  );
  const source = barcodeSourceImage(b, images);
  if (source) {
    const img = imageParagraph(source.path, 300, 300, source.dims);
    if (img) nodes.push(img);
  }
  return nodes;
}

// ─── Officer verification ───

function buildOfficerVerification(snapshot: ReportSnapshotV2): Node[] {
  const v = snapshot.officerVerification;
  const nodes: Node[] = [
    new Paragraph({ text: "Officer Verification", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `Verified By: ${v.verifiedByName} (${v.verifiedByRole})` }),
    new Paragraph({ text: `Jurisdiction: ${v.verifiedByRegion ?? "—"}` }),
    new Paragraph({ text: `Verification Date/Time: ${formatDate(v.verifiedAt)}` }),
    new Paragraph({ children: [new TextRun({ text: `Final Status: ${v.finalStatus}`, bold: true })] }),
  ];
  if (v.resolutions.length > 0) {
    nodes.push(new Paragraph({ children: [new TextRun({ text: "Officer Rule Resolutions:", bold: true })] }));
    for (const res of v.resolutions) {
      nodes.push(new Paragraph({ text: `${res.requirement} → ${res.resolvedStatus}: ${res.note}`, bullet: { level: 0 } }));
    }
  }
  nodes.push(new Paragraph({ children: [new TextRun({ text: v.governanceStatement, italics: true, size: 16 })] }));
  return nodes;
}

// ─── Digital integrity ───

function buildDigitalIntegrity(snapshot: ReportSnapshotV2): Node[] {
  const i = snapshot.integrity;
  return [
    new Paragraph({ text: "Digital Integrity & Authenticity", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `Report ID: ${i.reportId}` }),
    new Paragraph({ text: `Inspection ID: ${i.inspectionId}` }),
    new Paragraph({ text: `Generated At: ${formatDate(i.generatedAt)}` }),
    new Paragraph({ text: `Generated By: ${i.generatedByName}` }),
    new Paragraph({ text: `Report Format Version: ${i.reportFormatVersion}` }),
    new Paragraph({ text: `Rule Set Version: ${i.ruleSetVersion}` }),
    ...(i.pdfSha256 ? [new Paragraph({ children: [new TextRun({ text: `PDF SHA-256: ${i.pdfSha256}`, size: 16 })] })] : []),
    new Paragraph({ text: `Verify online: ${i.verifyUrl}` }),
  ];
}

export async function renderDocxV2(input: RenderReportInputV2): Promise<Buffer> {
  const { snapshot, images, logoPath, emblemPath, lockupPath } = input;

  const children: Node[] = [
    ...buildCover(snapshot, logoPath, lockupPath),
    ...buildTableOfContents(),
    ...buildExecutiveSummary(snapshot),
    ...buildDeclarations(snapshot.declarations),
    ...buildProductAndInspection(snapshot),
    ...buildResponsibleEntities(snapshot),
    ...buildPackagingGallery(snapshot, images),
    ...buildComplianceChecklist(snapshot.complianceChecklist),
    ...buildViolations(snapshot, images),
    ...buildFontMeasurements(snapshot.fontMeasurements, images),
    ...buildPlacementEvidence(snapshot.placementEvidence),
    ...buildReadabilityEvidence(snapshot.readabilityEvidence),
    ...buildBarcodeEvidence(snapshot, images),
    ...buildOfficerVerification(snapshot),
    ...buildDigitalIntegrity(snapshot),
  ];

  const accentBorder = { style: BorderStyle.SINGLE, size: 18, color: PALETTE.accentGold.hex, space: 8 };
  const pageBorder = { style: BorderStyle.SINGLE, size: 6, color: PALETTE.hairline.hex, space: 18 };

  // A small emblem "letterhead" mark in the running header (pages 2+
  // only, see `titlePage`/`first` below) — continuity across the
  // document without redrawing the cover's own, larger lockup.
  const emblemHeaderMark = fs.existsSync(emblemPath)
    ? new ImageRun({
        type: "png",
        data: fs.readFileSync(emblemPath),
        transformation: fitDimensions(600, 970, 14, 22),
      })
    : null;

  const doc = new Document({
    features: { updateFields: true },
    fonts: [
      { name: FONT_BODY, data: loadFont(FONT_FILES.interRegular) },
      { name: FONT_BODY, data: loadFont(FONT_FILES.interBold) },
      { name: FONT_HEADING, data: loadFont(FONT_FILES.serifRegular) },
      { name: FONT_HEADING, data: loadFont(FONT_FILES.serifSemiBold) },
      { name: FONT_HEADING, data: loadFont(FONT_FILES.serifBold) },
    ],
    styles: {
      default: {
        document: { run: { font: FONT_BODY, size: 19, color: PALETTE.ink.hex } },
        title: { run: { font: FONT_HEADING, bold: true, size: 44, color: PALETTE.headingNavy.hex } },
        heading1: {
          run: { font: FONT_HEADING, bold: true, size: 26, color: PALETTE.headingNavy.hex },
          paragraph: { border: { left: accentBorder }, spacing: { before: 240, after: 120 } },
        },
        heading2: {
          run: { font: FONT_HEADING, bold: true, size: 22, color: PALETTE.headingNavy.hex },
          paragraph: { border: { left: accentBorder }, spacing: { before: 200, after: 100 } },
        },
        heading3: {
          run: { font: FONT_HEADING, bold: true, size: 19, color: PALETTE.headingNavy.hex },
        },
      },
    },
    sections: [
      {
        properties: {
          // A blank `first` header/footer (below) needs this to take
          // effect — otherwise Word repeats `default` on the cover too.
          // The cover already carries its own, larger Consumer Affairs
          // lockup; the running header/footer stays off that one page,
          // matching pdf.ts's own page-1-has-no-header-or-footer choice.
          titlePage: true,
          page: {
            borders: {
              pageBorderTop: pageBorder,
              pageBorderBottom: pageBorder,
              pageBorderLeft: pageBorder,
              pageBorderRight: pageBorder,
            },
          },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ children: [] })] }),
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  ...(emblemHeaderMark ? [emblemHeaderMark] : []),
                  new TextRun({ text: `  DigiPramaan | ${REPORT_TITLE}`, size: 16, color: PALETTE.subtleText.hex }),
                ],
              }),
            ],
          }),
        },
        footers: {
          first: new Footer({ children: [new Paragraph({ children: [] })] }),
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: `Report ${snapshot.reportMetadata.reportId.slice(0, 8)}… · Inspection ${snapshot.inspection.inspectionId.slice(0, 8)}… · Page `,
                    size: 16,
                    color: PALETTE.subtleText.hex,
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: PALETTE.subtleText.hex }),
                  new TextRun({ text: " of ", size: 16, color: PALETTE.subtleText.hex }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: PALETTE.subtleText.hex }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}
