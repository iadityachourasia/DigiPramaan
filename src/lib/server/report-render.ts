/**
 * report-render.ts — assembles a report once and renders it three ways
 * (page 10, plus 13 §2's preview/export additions).
 *
 * ONE ASSEMBLY, THREE RENDERERS
 * ------------------------------
 * `buildReportDocument()` turns a stored `GeneratedReport` plus its live
 * records into a `ReportDocument`. The in-browser preview, the PDF and the
 * DOCX all read that same structure, so what a user previews is what they
 * download. 13 §2 asks for "a rendered in-browser preview of the PDF layout"
 * specifically, which only holds if the two cannot drift.
 *
 * REAL DOCUMENTS, SERVER-SIDE
 * ----------------------------
 * jsPDF and docx both run here rather than in the browser: `Packer.toBuffer`
 * is a Node API, it keeps ~850KB of library out of the client bundle, and a
 * route handler can set a real `Content-Disposition` so a plain link
 * downloads. The PS requires "PDF *and* editable formats" (BRD FR-FILE-04),
 * so the DOCX is genuine Word content — paragraphs and a real table, not a
 * PDF with a different extension.
 *
 * KNOWN GAP, SURFACED RATHER THAN HIDDEN
 * ---------------------------------------
 * jsPDF emits no `/StructTreeRoot`, so nothing generated here is a tagged
 * PDF. `ReportAccessibility.pdfIsTagged` is false everywhere and the UI
 * warns (A-12 / WCAG 1.3.1). That is a real accessibility gap in the
 * product, not a presentation choice.
 */

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

import { findMockUser } from "@/lib/mock/users";
import {
  violationCategory,
  type ComplianceRecord,
  type GeneratedReport,
  type ReportAttribution,
  type ReportDocument,
  type ReportRecordSection,
  type Role,
} from "@/types";

/**
 * Records rendered in the body of one document. A 100-row report is already
 * past the large-scope warning; beyond this the document says how many were
 * omitted rather than running to hundreds of pages or truncating silently.
 */
const MAX_BODY_RECORDS = 100;

const DEPARTMENT = "Department of Consumer Affairs";
const MINISTRY = "Ministry of Consumer Affairs, Food & Public Distribution";
const GOVERNMENT = "Government of India";

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/** The verifier of one record, read from its audit trail — never re-entered (13 §2). */
function verifierOf(
  record: ComplianceRecord
): { name: string; role: Role; region: string; verifiedAt: string } | undefined {
  const event = [...record.auditTrail].reverse().find((entry) => entry.type === "Verified");
  if (!event?.byUserId) return undefined;
  const user = findMockUser(event.byUserId);
  if (!user) return undefined;
  return { name: user.fullName, role: user.role, region: user.region, verifiedAt: event.at };
}

function toSection(record: ComplianceRecord): ReportRecordSection {
  const verifier = verifierOf(record);
  return {
    recordId: record.id,
    scanId: record.scanId,
    productName: record.productName,
    manufacturerName: record.manufacturerName,
    category: record.category,
    region: record.region,
    complianceStatus: record.complianceStatus,
    ...(record.complianceScore ? { complianceScore: record.complianceScore.value } : {}),
    ...(verifier
      ? { verifier: { name: verifier.name, role: verifier.role, verifiedAt: verifier.verifiedAt } }
      : {}),
    violations: record.violations.map((violation) => {
      const definition = violationCategory(violation.categoryId);
      return {
        category: definition.category,
        legalBasis: definition.legalBasis,
        ...(violation.detail ? { detail: violation.detail } : {}),
      };
    }),
  };
}

/**
 * Which attribution block this document carries. See `ReportAttribution` for
 * why one block cannot serve all three cases.
 */
function buildAttribution(
  report: GeneratedReport,
  records: readonly ComplianceRecord[]
): ReportAttribution {
  if (records.length === 1) {
    const verifier = verifierOf(records[0]!);
    if (!verifier) return { kind: "unverified" };
    return {
      kind: "verifier",
      name: verifier.name,
      role: verifier.role,
      region: verifier.region,
      verifiedAt: verifier.verifiedAt,
    };
  }

  const compiler = findMockUser(report.generatedByUserId);
  return {
    kind: "compiler",
    name: compiler?.fullName ?? report.generatedByUserName,
    role: compiler?.role ?? "Enforcement Officer",
    region: compiler?.region ?? "—",
    compiledAt: report.generatedAt,
  };
}

export function buildReportDocument(
  report: GeneratedReport,
  records: readonly ComplianceRecord[],
  origin: string
): ReportDocument {
  const body = records.slice(0, MAX_BODY_RECORDS);
  return {
    title: report.name,
    scopeDescription: report.name,
    generatedAt: report.generatedAt,
    referenceCode: report.referenceCode,
    verifyUrl: `${origin}/en/reports?reference=${encodeURIComponent(report.referenceCode)}`,
    attribution: buildAttribution(report, records),
    records: body.map(toSection),
    totalRecords: records.length,
    truncated: records.length > body.length,
  };
}

/* ------------------------------------------------------------------ *
 * Shared wording
 * ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The attribution block as lines of text, so the PDF and the DOCX say the
 * same thing. The `unverified` case is deliberately explicit: the document
 * states the record has not been verified rather than leaving a blank a
 * reader might fill in themselves.
 */
export function attributionLines(attribution: ReportAttribution): string[] {
  if (attribution.kind === "unverified") {
    return [
      "Not yet verified.",
      "This record is still Pending. No officer has confirmed its extracted declarations,",
      "so no verification attribution can be given.",
    ];
  }

  if (attribution.kind === "verifier") {
    return [
      `Verified by: ${attribution.name}`,
      `Role: ${attribution.role}`,
      `Region: ${attribution.region}`,
      `Verification completed: ${formatDate(attribution.verifiedAt)}`,
    ];
  }

  return [
    `Compiled by: ${attribution.name}`,
    `Role: ${attribution.role}`,
    `Region: ${attribution.region}`,
    `Compiled: ${formatDate(attribution.compiledAt)}`,
    "Each record below carries its own verifying officer.",
  ];
}

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595; // A4 portrait, points
const PAGE_HEIGHT = 842;
const LINE = 15;

export async function renderPdf(doc: ReportDocument): Promise<Buffer> {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  let y = PAGE_MARGIN;

  function ensureRoom(needed: number): void {
    if (y + needed <= PAGE_HEIGHT - PAGE_MARGIN) return;
    pdf.addPage();
    y = PAGE_MARGIN;
  }

  function text(value: string, size: number, style: "normal" | "bold" = "normal"): void {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(value, PAGE_WIDTH - PAGE_MARGIN * 2) as string[];
    for (const line of lines) {
      ensureRoom(LINE);
      pdf.text(line, PAGE_MARGIN, y);
      y += LINE;
    }
  }

  function rule(): void {
    ensureRoom(LINE);
    pdf.setDrawColor(180);
    pdf.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
    y += LINE;
  }

  // Masthead
  text(GOVERNMENT, 10);
  text(MINISTRY, 10);
  text(DEPARTMENT, 10);
  y += 6;
  text("Legal Metrology Compliance Report", 17, "bold");
  text(doc.scopeDescription, 11);
  text(`Generated: ${formatDate(doc.generatedAt)}`, 9);
  rule();

  // Attribution
  text("Officer attribution", 12, "bold");
  for (const line of attributionLines(doc.attribution)) text(line, 10);
  rule();

  // Records
  text(
    doc.truncated
      ? `Records (showing ${doc.records.length} of ${doc.totalRecords})`
      : `Records (${doc.totalRecords})`,
    12,
    "bold"
  );
  y += 4;

  for (const record of doc.records) {
    ensureRoom(LINE * 6);
    text(`${record.productName}  —  ${record.scanId}`, 11, "bold");
    text(`Manufacturer: ${record.manufacturerName}`, 10);
    text(`Category: ${record.category}    Region: ${record.region}`, 10);
    text(
      `Compliance Status: ${record.complianceStatus}${
        record.complianceScore === undefined ? "" : `    Score: ${record.complianceScore}`
      }`,
      10
    );
    if (record.verifier) {
      text(
        `Verified by ${record.verifier.name} (${record.verifier.role}) on ${formatDate(
          record.verifier.verifiedAt
        )}`,
        9
      );
    }

    if (record.violations.length === 0) {
      text("No violations recorded.", 10);
    } else {
      text("Violations:", 10, "bold");
      for (const violation of record.violations) {
        text(`• ${violation.category}  (${violation.legalBasis})`, 10);
        if (violation.detail) text(`   ${violation.detail}`, 9);
      }
    }
    y += 8;
  }

  if (doc.truncated) {
    rule();
    text(
      `${doc.totalRecords - doc.records.length} further records are covered by this scope but not printed here.`,
      9
    );
  }

  // Verification footer with QR (13 §2)
  ensureRoom(110);
  rule();
  text("Verification", 12, "bold");
  text(`Reference code: ${doc.referenceCode}`, 10);
  text("Scan to check this report against the system.", 9);
  const qrDataUrl = await QRCode.toDataURL(doc.verifyUrl, { margin: 1, width: 220 });
  ensureRoom(90);
  pdf.addImage(qrDataUrl, "PNG", PAGE_MARGIN, y, 84, 84);
  y += 92;

  return Buffer.from(pdf.output("arraybuffer"));
}

/* ------------------------------------------------------------------ *
 * DOCX
 * ------------------------------------------------------------------ */

function cell(value: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: value, bold })] })],
  });
}

export async function renderDocx(doc: ReportDocument): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ children: [new TextRun({ text: GOVERNMENT, size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: MINISTRY, size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: DEPARTMENT, size: 18 })] }),
    new Paragraph({
      text: "Legal Metrology Compliance Report",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: doc.scopeDescription }),
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${formatDate(doc.generatedAt)}`, size: 18 })],
    }),
    new Paragraph({ text: "Officer attribution", heading: HeadingLevel.HEADING_2 }),
    ...attributionLines(doc.attribution).map((line) => new Paragraph({ text: line })),
    new Paragraph({
      text: doc.truncated
        ? `Records (showing ${doc.records.length} of ${doc.totalRecords})`
        : `Records (${doc.totalRecords})`,
      heading: HeadingLevel.HEADING_2,
    }),
  ];

  /*
   * A real Word table, not preformatted text — this is the half of the PS
   * requirement that a PDF cannot satisfy, so the editable format has to be
   * genuinely editable when it opens.
   */
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell("Scan ID", true),
            cell("Product", true),
            cell("Manufacturer", true),
            cell("Compliance Status", true),
            cell("Violations", true),
          ],
        }),
        ...doc.records.map(
          (record) =>
            new TableRow({
              children: [
                cell(record.scanId),
                cell(record.productName),
                cell(record.manufacturerName),
                cell(record.complianceStatus),
                cell(String(record.violations.length)),
              ],
            })
        ),
      ],
    })
  );

  for (const record of doc.records) {
    children.push(
      new Paragraph({
        text: `${record.productName} — ${record.scanId}`,
        heading: HeadingLevel.HEADING_3,
      }),
      new Paragraph({ text: `Manufacturer: ${record.manufacturerName}` }),
      new Paragraph({ text: `Category: ${record.category}    Region: ${record.region}` }),
      new Paragraph({
        text: `Compliance Status: ${record.complianceStatus}${
          record.complianceScore === undefined ? "" : `    Score: ${record.complianceScore}`
        }`,
      })
    );
    if (record.verifier) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Verified by ${record.verifier.name} (${record.verifier.role}) on ${formatDate(
                record.verifier.verifiedAt
              )}`,
              size: 18,
            }),
          ],
        })
      );
    }
    if (record.violations.length === 0) {
      children.push(new Paragraph({ text: "No violations recorded." }));
    } else {
      for (const violation of record.violations) {
        children.push(
          new Paragraph({
            text: `${violation.category} (${violation.legalBasis})${
              violation.detail ? ` — ${violation.detail}` : ""
            }`,
            bullet: { level: 0 },
          })
        );
      }
    }
  }

  if (doc.truncated) {
    children.push(
      new Paragraph({
        text: `${doc.totalRecords - doc.records.length} further records are covered by this scope but not printed here.`,
      })
    );
  }

  children.push(
    new Paragraph({ text: "Verification", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `Reference code: ${doc.referenceCode}` }),
    new Paragraph({ text: doc.verifyUrl })
  );

  return Packer.toBuffer(new Document({ sections: [{ children }] })) as Promise<Buffer>;
}
