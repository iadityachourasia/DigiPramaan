/**
 * report-render-v2/docx.ts — renderDocxV2(), the Advanced Regulatory
 * Report DOCX. The `docx` npm package, same as System B's existing
 * renderer — real Heading styles, real editable tables, embedded images,
 * never a flattened screenshot. Mirrors pdf.ts's section list so both
 * documents carry the same content in the same order.
 */

import fs from "node:fs";

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type {
  ChecklistRowV2,
  FontMeasurementV2,
  PlacementEvidenceV2,
  ReadabilityEvidenceV2,
  RenderReportInputV2,
  ReportSnapshotV2,
} from "@/types/report-v2";

import { DEPARTMENT, GOVERNMENT, MINISTRY, REPORT_TITLE, STATUS_LABEL, angleLabel, fitDimensions, formatDate } from "./shared";

type Node = Paragraph | Table;

function cell(value: string, bold = false): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold })] })] });
}

function headerRow(labels: string[]): TableRow {
  return new TableRow({ children: labels.map((l) => cell(l, true)) });
}

function table(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow(headers), ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) }))],
  });
}

/** `naturalDims` comes from the Python side (Pillow already knows the
 * post-resize file dimensions when it writes each file) — the DOCX path
 * has no dimension-reading logic of its own, deliberately, to avoid a new
 * dependency for something the producer already knows. Falls back to a
 * square assumption for the fixed report-logo asset, whose real aspect
 * ratio (600x600, confirmed square) is known and stable. */
function imageParagraph(path: string, maxW: number, maxH: number, naturalDims?: [number, number]): Paragraph | null {
  if (!fs.existsSync(path)) return null;
  const buffer = fs.readFileSync(path);
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

// ─── Cover ───

function buildCover(snapshot: ReportSnapshotV2, logoPath: string): Node[] {
  const nodes: Node[] = [];
  const logo = imageParagraph(logoPath, 110, 110, [600, 600]);
  if (logo) nodes.push(logo);
  nodes.push(
    new Paragraph({ children: [new TextRun({ text: GOVERNMENT, size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: `${MINISTRY} · ${DEPARTMENT}`, size: 18 })] }),
    new Paragraph({ text: REPORT_TITLE.toUpperCase(), heading: HeadingLevel.TITLE }),
  );

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
        new TextRun({ text: snapshot.overallAssessment.complianceStatus.toUpperCase(), bold: true, size: 32 }),
      ],
    }),
    new Paragraph({ text: `Report ID: ${snapshot.reportMetadata.reportId}` }),
    new Paragraph({ text: `Reference: ${snapshot.reportMetadata.referenceCode}` }),
    new Paragraph({ text: `Verify at: ${snapshot.integrity.verifyUrl}` }),
  );
  return nodes;
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

// ─── Original evidence images ───

function buildOriginalImages(snapshot: ReportSnapshotV2, images: RenderReportInputV2["images"]): Node[] {
  if (snapshot.originalImages.length === 0) return [];
  const nodes: Node[] = [new Paragraph({ text: "Original Inspection Evidence", heading: HeadingLevel.HEADING_1 })];
  const pathByAngle: Record<string, string | null> = { front: images.front, back: images.back, side_pdp: images.side_pdp };
  for (const ref of snapshot.originalImages) {
    nodes.push(new Paragraph({ text: angleLabel(ref.angle), heading: HeadingLevel.HEADING_3 }));
    const path = pathByAngle[ref.angle];
    const img = path ? imageParagraph(path, 380, 420, images.dimensions[ref.angle]) : null;
    nodes.push(img ?? new Paragraph({ text: "(Image unavailable)" }));
    nodes.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Evidence ID: ${ref.imageId}   Captured: ${formatDate(ref.uploadedAt)}   Quality: ${ref.qualityVerdict ?? "—"}`,
            size: 16,
          }),
        ],
      })
    );
  }
  return nodes;
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
  const pathByAngle: Record<string, string | null> = { front: images.front, back: images.back, side_pdp: images.side_pdp };

  snapshot.violations.forEach((v, index) => {
    nodes.push(
      new Paragraph({ text: `Violation ${String(index + 1).padStart(2, "0")}`, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: `Rule: ${v.ruleId ?? "—"}` }),
      new Paragraph({ text: `Legal Basis: ${v.legalBasis}` }),
      new Paragraph({ text: `Category: ${v.category}` }),
      new Paragraph({ text: `Final Status: ${STATUS_LABEL[v.result] ?? v.result}` }),
    );
    if (v.detail) nodes.push(new Paragraph({ text: `Deterministic Finding: ${v.detail}` }));

    const originalPath = v.originalImage ? pathByAngle[v.originalImage.angle] : undefined;
    if (originalPath && v.originalImage) {
      const img = imageParagraph(originalPath, 300, 300, images.dimensions[v.originalImage.angle]);
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
      new Paragraph({ text: `Result: ${STATUS_LABEL[m.result] ?? m.result}` }),
      new Paragraph({ text: `Declaration measured: ${m.fieldId ?? "—"}` }),
      new Paragraph({ text: `Measured height: ${m.measuredHeightMm !== null ? `${m.measuredHeightMm.toFixed(2)} mm` : "—"}` }),
      new Paragraph({ text: `Measurement confidence: ${m.confidence !== null ? `${Math.round(m.confidence * 100)}%` : "—"}` }),
      new Paragraph({ text: `Calibration method: ${m.calibrationMethod ?? "—"}` }),
      new Paragraph({ text: `Reference dimension: ${m.knownDimensionMm !== null ? `${m.knownDimensionMm} mm` : "—"}` }),
      new Paragraph({ text: `Pixels/mm: ${m.pixelsPerMm !== null ? m.pixelsPerMm.toFixed(2) : "—"}` }),
      new Paragraph({
        children: [new TextRun({ text: m.insufficientLegalValidationMessage, bold: true })],
      }),
    );
    const angle = images.front ? "front" : images.back ? "back" : images.side_pdp ? "side_pdp" : null;
    const path = images.front || images.back || images.side_pdp;
    if (path && angle) {
      const img = imageParagraph(path, 300, 300, images.dimensions[angle]);
      if (img) nodes.push(img);
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
      new Paragraph({ text: `Result: ${STATUS_LABEL[r.result] ?? r.result}` }),
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
    nodes.push(new Paragraph({ text: `Result: ${STATUS_LABEL[r.result] ?? r.result}` }));
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
        }),
      ],
    })
  );
  const barcodeAngle = images.front ? "front" : images.back ? "back" : images.side_pdp ? "side_pdp" : null;
  const barcodePath = images.front || images.back || images.side_pdp;
  if (barcodePath && barcodeAngle) {
    const img = imageParagraph(barcodePath, 300, 300, images.dimensions[barcodeAngle]);
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
  const { snapshot, images, logoPath } = input;

  const children: Node[] = [
    ...buildCover(snapshot, logoPath),
    ...buildExecutiveSummary(snapshot),
    ...buildProductAndInspection(snapshot),
    ...buildResponsibleEntities(snapshot),
    ...buildOriginalImages(snapshot, images),
    ...buildComplianceChecklist(snapshot.complianceChecklist),
    ...buildViolations(snapshot, images),
    ...buildFontMeasurements(snapshot.fontMeasurements, images),
    ...buildPlacementEvidence(snapshot.placementEvidence),
    ...buildReadabilityEvidence(snapshot.readabilityEvidence),
    ...buildBarcodeEvidence(snapshot, images),
    ...buildOfficerVerification(snapshot),
    ...buildDigitalIntegrity(snapshot),
  ];

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `DigiPramaan | ${REPORT_TITLE}`, size: 16, color: "888888" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: `Report ${snapshot.reportMetadata.reportId.slice(0, 8)}… · Inspection ${snapshot.inspection.inspectionId.slice(0, 8)}… · Page `,
                    size: 16,
                    color: "888888",
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" }),
                  new TextRun({ text: " of ", size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "888888" }),
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
