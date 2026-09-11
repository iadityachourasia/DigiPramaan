/**
 * report-render-v2.test.ts — behavioral tests for the Advanced Regulatory
 * Report renderer (Phase 13). No PDF/DOCX-content-inspection library
 * existed in this repo before this phase; `pdf-parse` (already a
 * dependency-free, no-native-bindings package) is added specifically for
 * the PDF text-extraction assertions below. The DOCX assertions are
 * black-box against the public `renderDocxV2()` output (unzipping the
 * real OOXML it produces) rather than importing docx.ts's private
 * section-builder functions — this tests actual behavior, not
 * implementation detail, and needs no change to that file's exports.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";

import { renderDocxV2 } from "@/lib/server/report-render-v2";
import { renderPdfV2 } from "@/lib/server/report-render-v2";
import type { RenderReportInputV2, ReportSnapshotV2 } from "@/types/report-v2";

function writeTestJpeg(dir: string, name: string, hex: string): string {
  // A minimal, real, decodable 2x2 JPEG (not a placeholder string) so
  // jsPDF's getImageProperties()/addImage() and the DOCX ImageRun path
  // both have real bytes to work with.
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, Buffer.from(hex, "base64"));
  return filePath;
}

// A tiny real JPEG (solid color, 8x8), base64-encoded, used for every
// embedded-image assertion below — small enough to inline here.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

function makeSnapshot(overrides: Partial<ReportSnapshotV2> = {}): ReportSnapshotV2 {
  return {
    schemaVersion: "2.0",
    reportMetadata: {
      reportId: "r-test-1",
      referenceCode: "ref-test-1",
      generatedAt: "2026-01-01T10:00:00Z",
      generatedByName: "Field Inspector",
      generatedByRole: "Enforcement Officer",
      generatedByRegion: "Maharashtra",
      reportFormatVersion: "2.0",
      ruleSetVersion: "legal-metrology-2011-v1",
    },
    inspection: {
      inspectionId: "insp-test-1",
      scannedAt: "2026-01-01T09:00:00Z",
      source: "Officer-Scanned",
      region: "Maharashtra",
      category: "Packaged Food",
    },
    product: {
      productName: "Refined Groundnut Oil",
      genericName: "Groundnut Oil",
      category: "Packaged Food",
      netQuantity: "1 L",
      mrp: "Rs 199",
      countryOfOrigin: "India",
    },
    responsibleEntities: [
      { role: "manufacturer", value: "SAHYADRI FOODS PVT LTD", notDetected: false, corrected: false },
    ],
    overallAssessment: {
      complianceStatus: "Non-Compliant",
      complianceScore: 40,
      complianceBand: "Poor",
      verificationStatus: "Verified",
    },
    originalImages: [],
    declarations: [],
    complianceChecklist: [],
    violations: [],
    fontMeasurements: [],
    placementEvidence: [],
    readabilityEvidence: [],
    barcodeEvidence: null,
    officerVerification: {
      verifiedByName: "Field Inspector",
      verifiedByRole: "Enforcement Officer",
      verifiedByRegion: "Maharashtra",
      verifiedAt: "2026-01-01T09:30:00Z",
      finalStatus: "Non-Compliant",
      resolutions: [],
      governanceStatement:
        "AI-assisted extraction and explanation were used only as decision-support tools. Legal compliance status was determined by the configured deterministic rule engine and verified by the authorized officer.",
    },
    integrity: {
      reportId: "r-test-1",
      inspectionId: "insp-test-1",
      generatedAt: "2026-01-01T10:00:00Z",
      generatedByName: "Field Inspector",
      reportFormatVersion: "2.0",
      ruleSetVersion: "legal-metrology-2011-v1",
      pdfSha256: null,
      docxSha256: null,
      verifyUrl: "http://localhost:3000/en/verify/report/r-test-1",
    },
    ...overrides,
  };
}

function makeInput(snapshot: ReportSnapshotV2, logoPath: string): RenderReportInputV2 {
  return {
    snapshot,
    images: { front: null, back: null, side_pdp: null, violationCrops: {}, dimensions: {} },
    logoPath,
  };
}

describe("report-render-v2", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-report-render-test-"));
  const logoPath = writeTestJpeg(tmpDir, "logo.jpg", TINY_JPEG_BASE64);

  it("PDF generates, contains selectable text, and never states an unvalidated Rule 7 threshold", async () => {
    const snapshot = makeSnapshot({
      fontMeasurements: [
        {
          ruleId: "rule_7_font_size",
          result: "NEEDS_REVIEW",
          message: "measured",
          fieldId: "netQuantity",
          imageId: null,
          calibrationMethod: "manual_two_point",
          knownDimensionMm: 10,
          pixelLength: 100,
          pixelsPerMm: 10,
          bbox: null,
          measuredCharacterHeightPx: 42,
          measuredHeightMm: 4.2,
          confidence: 0.8,
          insufficientLegalValidationMessage:
            "Physical font height measured, but the applicable statutory threshold requires legal validation.",
        },
      ],
    });

    const pdfBuffer = await renderPdfV2(makeInput(snapshot, logoPath));
    expect(pdfBuffer.length).toBeGreaterThan(0);

    const parsed = await new PDFParse({ data: pdfBuffer }).getText();
    expect(parsed.text).toContain("Refined Groundnut Oil");
    expect(parsed.text).toContain("NON-COMPLIANT");
    expect(parsed.text).toContain(
      "Physical font height measured, but the applicable statutory threshold requires legal validation."
    );
    for (const forbidden of ["4mm", "4 mm", "6mm", "6 mm"]) {
      expect(parsed.text).not.toContain(forbidden);
    }
  });

  it("PDF page count grows with content — not capped at a fixed 2 pages", async () => {
    const manyViolations = Array.from({ length: 15 }, (_, i) => ({
      ruleId: `rule_${i}`,
      category: "Other",
      legalBasis: `Rule ${i}`,
      detail: `Violation number ${i} with a reasonably long description to consume vertical space on the page.`,
      result: "FAIL" as const,
      aiExplanation: null,
      aiExplanationLabel: "AI-assisted explanation — interpretive aid only",
      originalImage: null,
      bbox: null,
      cropImageRef: null,
    }));
    const snapshot = makeSnapshot({ violations: manyViolations });
    const pdfBuffer = await renderPdfV2(makeInput(snapshot, logoPath));
    const parsed = await new PDFParse({ data: pdfBuffer }).getText();
    // The task's own requirement this guards: the document is NOT capped
    // at the old renderer's ~2-page ceiling — 15 substantial violations
    // must push it well past that.
    expect(parsed.total).toBeGreaterThan(2);
  });

  it("DOCX generates with real Heading styles, a real editable table, and embedded images", async () => {
    const snapshot = makeSnapshot({
      complianceChecklist: [
        {
          ruleId: "rule_6e_mrp",
          requirement: "Retail sale price (MRP)",
          observedValue: null,
          result: "FAIL",
          evidenceNote: "MRP absent",
          evidenceImageId: null,
          evidenceAngle: null,
          officerResolutionNote: null,
        },
      ],
    });
    const docxBuffer = await renderDocxV2(makeInput(snapshot, logoPath));
    expect(docxBuffer.length).toBeGreaterThan(0);

    // A .docx is a zip of OOXML parts — read document.xml directly rather
    // than adding a DOCX-parsing dependency (mammoth) just for tests.
    const entries = readZipEntries(docxBuffer);
    const documentXml = entries.get("word/document.xml");
    expect(documentXml).toBeDefined();
    const xml = documentXml!.toString("utf-8");

    expect(xml).toContain("Heading1");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("NON-COMPLIANT");
    expect([...entries.keys()].some((name) => name.startsWith("word/media/"))).toBe(true);
  });

  it("conditional sections are omitted cleanly when there is no data", async () => {
    const snapshot = makeSnapshot(); // no barcode, no violations, no Rule 7/8/9 evidence
    const pdfBuffer = await renderPdfV2(makeInput(snapshot, logoPath));
    const parsed = await new PDFParse({ data: pdfBuffer }).getText();
    expect(parsed.text).not.toContain("PRODUCT IDENTIFIER / BARCODE EVIDENCE");
    expect(parsed.text).toContain("No confirmed violations.");
  });
});

/** Minimal, dependency-free ZIP central-directory reader — good enough
 * to pull named entries (e.g. "word/document.xml") out of a .docx
 * without adding a zip library just for this test file. */
function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid zip (docx) buffer");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < entryCount; i++) {
    const signature = buffer.readUInt32LE(cdOffset);
    if (signature !== 0x02014b50) break;
    const compressionMethod = buffer.readUInt16LE(cdOffset + 10);
    const compressedSize = buffer.readUInt32LE(cdOffset + 20);
    const nameLength = buffer.readUInt16LE(cdOffset + 28);
    const extraLength = buffer.readUInt16LE(cdOffset + 30);
    const commentLength = buffer.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(cdOffset + 42);
    const name = buffer.toString("utf-8", cdOffset + 46, cdOffset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const rawData = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = compressionMethod === 0 ? rawData : zlib.inflateRawSync(rawData);
    entries.set(name, data);

    cdOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
