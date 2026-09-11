/**
 * Mock compliance records.
 *
 * These are built from a compact seed rather than written out longhand, so the
 * derived parts cannot drift from the rules that define them:
 *
 *   - Compliance Status is computed by computeComplianceStatus(), the same function
 *     the app uses. No record can carry a status its own checklist contradicts.
 *   - A failed checklist line always produces exactly one violation, and its wording
 *     comes from VIOLATION_TAXONOMY rather than a retyped string.
 *   - Confidence bands are derived from the percentage by confidenceBand().
 *
 * Coverage is deliberate. Between them the seeds below exercise all four Compliance
 * Status values, both Verification Status values, all three source tags, an import
 * with a country-of-origin requirement, a Rule 7 font-size failure with real
 * measurements, a not-detected field, a low-confidence field, an officer-corrected
 * field, an archived record, and a record already flagged for enforcement.
 */

import {
  computeComplianceScore,
  computeComplianceStatus,
  confidenceBand,
  DECLARATION_FIELDS,
  violationCategory,
  type AuditEvent,
  type ComplianceRecord,
  type DeclarationCheck,
  type DeclarationFieldId,
  type Evidence,
  type ExtractedDeclaration,
  type FontSizeCheck,
  type ProductCategory,
  type SourceTag,
  type UploadedImage,
  type VerificationStatus,
  type Violation,
} from "@/types";

import { mockUserName } from "./users";

/** A failed declaration, with the specifics that make the citation useful. */
interface SeedFailure {
  fieldId: DeclarationFieldId | "fontSize";
  /** Appended to the citation, e.g. "numeral height 3 mm, below required 4 mm". */
  detail?: string;
}

interface RecordSeed {
  id: string;
  scanId: string;
  productName: string;
  manufacturerName: string;
  category: ProductCategory;
  region: string;
  source: SourceTag;
  verificationStatus: VerificationStatus;
  needsReviewFlag?: boolean;
  needsReviewByUserId?: string;
  needsReviewNote?: string;
  flaggedForEnforcement?: boolean;
  archived?: boolean;
  isImport?: boolean;
  scannedAt: string;
  lastUpdatedAt: string;
  scannedByUserId: string;
  verifiedByUserId?: string;
  failures: SeedFailure[];
  /** Fields the pipeline never found. Rendered differently from low confidence. */
  notDetected?: DeclarationFieldId[];
  /** Fields an officer edited. A third, distinct visual state again. */
  corrected?: DeclarationFieldId[];
  /** Per-field confidence overrides. Anything unlisted is treated as high. */
  confidence?: Partial<Record<DeclarationFieldId, number>>;
  fontSize?: FontSizeCheck[];
  evidenceCaptions?: string[];
  ecommerceListingUrl?: string;
}

/**
 * Plausible extracted values, so no screen shows "Test" or lorem ipsum.
 * Exported — src/lib/server/scan-pipeline-store.ts reuses this rather than
 * keeping a second, drifting copy of sample declaration text.
 */
export const SAMPLE_VALUES: Record<DeclarationFieldId, string> = {
  manufacturerDetails:
    "Sahyadri Foods Pvt Ltd, Plot 14, MIDC Industrial Area, Pune 411019, Maharashtra",
  genericName: "Refined groundnut oil",
  netQuantity: "1 L",
  manufactureDate: "07/2026",
  retailSalePrice: "MRP ₹235.00 (inclusive of all taxes)",
  countryOfOrigin: "India",
  consumerCareDetails: "care@sahyadrifoods.example.in · 1800 200 4321",
};

/**
 * Which photographed face each declaration is plausibly read from
 * (13-history-and-hierarchy.md §1.1's `sourceImageAngle`). Fixed, not
 * random, so a field's source badge is reproducible across runs — also
 * reused by scan-pipeline-store.ts for the same reason.
 */
export const DECLARATION_FIELD_SOURCE_ANGLE: Record<
  DeclarationFieldId,
  "front" | "back" | "side_pdp"
> = {
  genericName: "front",
  netQuantity: "front",
  retailSalePrice: "side_pdp",
  manufacturerDetails: "back",
  consumerCareDetails: "back",
  manufactureDate: "side_pdp",
  countryOfOrigin: "side_pdp",
};

function placeholderImage(seedId: string, category: ProductCategory): UploadedImage {
  const slug = category.toLowerCase().replace(/[^a-z]+/g, "-");
  return {
    id: `${seedId}-img-front`,
    fileName: `${seedId}-front.jpg`,
    url: `/images/placeholder/${slug}.svg`,
    sizeBytes: 842_000,
    angle: "front",
    altText: `Front label of the scanned package, scan ${seedId}`,
  };
}

const ANGLE_LABEL: Record<"front" | "back" | "side_pdp", string> = {
  front: "Front",
  back: "Back",
  side_pdp: "Side — Principal Display Panel",
};

/**
 * The three captured photographs a static seed carries (`capturedImages` on
 * `ComplianceRecord`) — a static seed has no real per-angle photo, so every
 * angle points at the same category placeholder image `placeholderImage()`
 * already draws the thumbnail from, same coarse-placeholder precedent.
 */
function placeholderImages(seedId: string, category: ProductCategory): UploadedImage[] {
  const slug = category.toLowerCase().replace(/[^a-z]+/g, "-");
  return (["front", "back", "side_pdp"] as const).map((angle) => ({
    id: `${seedId}-img-${angle}`,
    fileName: `${seedId}-${angle}.jpg`,
    url: `/images/placeholder/${slug}.svg`,
    sizeBytes: 842_000,
    angle,
    altText: `${ANGLE_LABEL[angle]} of the scanned package, scan ${seedId}`,
  }));
}

function buildChecklist(seed: RecordSeed): DeclarationCheck[] {
  const failed = new Map(seed.failures.map((f) => [f.fieldId, f]));
  const notDetected = new Set(seed.notDetected ?? []);

  const declarationLines: DeclarationCheck[] = DECLARATION_FIELDS.filter(
    (field) => !field.importsOnly || seed.isImport === true
  ).map((field) => {
    const failure = failed.get(field.id);
    if (!failure) {
      return { fieldId: field.id, passed: true, value: SAMPLE_VALUES[field.id] };
    }
    const line: DeclarationCheck = {
      fieldId: field.id,
      passed: false,
      value: notDetected.has(field.id) ? null : SAMPLE_VALUES[field.id],
      violationCategoryId: field.failsAs,
    };
    if (failure.detail !== undefined) line.detail = failure.detail;
    return line;
  });

  const fontFailure = failed.get("fontSize");
  const fontLine: DeclarationCheck = fontFailure
    ? {
        fieldId: "fontSize",
        passed: false,
        value: null,
        violationCategoryId: "font-size-readability-failure",
        ...(fontFailure.detail !== undefined ? { detail: fontFailure.detail } : {}),
      }
    : { fieldId: "fontSize", passed: true, value: null };

  return [...declarationLines, fontLine];
}

function buildViolations(checklist: DeclarationCheck[]): Violation[] {
  return checklist
    .filter((line) => !line.passed && line.violationCategoryId)
    .map((line) => {
      const definition = violationCategory(line.violationCategoryId!);
      const violation: Violation = {
        categoryId: definition.id,
        category: definition.category,
        legalBasis: definition.legalBasis,
      };
      if (line.detail !== undefined) violation.detail = line.detail;
      return violation;
    });
}

function buildDeclarations(seed: RecordSeed): ExtractedDeclaration[] {
  const notDetected = new Set(seed.notDetected ?? []);
  const corrected = new Set(seed.corrected ?? []);

  return DECLARATION_FIELDS.filter(
    (field) => !field.importsOnly || seed.isImport === true
  ).map((field) => {
    const missing = notDetected.has(field.id);
    const confidence = missing ? 0 : (seed.confidence?.[field.id] ?? 96);
    const entry: ExtractedDeclaration = {
      fieldId: field.id,
      value: missing ? null : SAMPLE_VALUES[field.id],
      notDetected: missing,
      confidence,
      band: confidenceBand(confidence),
      corrected: corrected.has(field.id),
      /* A static seed has no real pipeline run behind it — PaddleOCR is the
       * plausible default source engine for every field that isn't missing. */
      sourceEngine: "paddleocr",
      sourceImageAngle: DECLARATION_FIELD_SOURCE_ANGLE[field.id],
    };
    if (corrected.has(field.id)) entry.correctedByUserId = seed.scannedByUserId;
    return entry;
  });
}

/**
 * Seeds still author a minimal trail here, and only here: `ComplianceRecord`
 * has no `scannedByUserId` or `verifiedAt` field, so this is the one place
 * that knows which officer did what to a fixture.
 *
 * `audit-store.ts` reads these on first access and re-expresses them as
 * activity events, then overwrites this array with its own projection — so
 * what finally renders comes from the central log like everything else, and
 * gains the spread timestamps and resolved names a hand-built array lacked.
 */
function buildAuditTrail(seed: RecordSeed): AuditEvent[] {
  const events: AuditEvent[] = [
    {
      id: `${seed.id}-audit-1`,
      type: "Scanned",
      at: seed.scannedAt,
      byUserId: seed.scannedByUserId,
      byUserName: mockUserName(seed.scannedByUserId),
    },
  ];

  if (seed.verificationStatus === "Verified" && seed.verifiedByUserId) {
    events.push({
      id: `${seed.id}-audit-2`,
      type: "Verified",
      at: seed.lastUpdatedAt,
      byUserId: seed.verifiedByUserId,
      byUserName: mockUserName(seed.verifiedByUserId),
    });
  }

  if (seed.flaggedForEnforcement) {
    events.push({
      id: `${seed.id}-audit-3`,
      type: "Flagged for Enforcement",
      at: seed.lastUpdatedAt,
      byUserId: seed.verifiedByUserId ?? seed.scannedByUserId,
      byUserName: mockUserName(seed.verifiedByUserId ?? seed.scannedByUserId),
    });
  }

  return events;
}

function buildEvidence(seed: RecordSeed): Evidence[] {
  return (seed.evidenceCaptions ?? []).map((caption, index) => ({
    id: `${seed.id}-ev-${index + 1}`,
    image: {
      id: `${seed.id}-ev-img-${index + 1}`,
      fileName: `${seed.id}-evidence-${index + 1}.jpg`,
      url: `/images/placeholder/evidence.svg`,
      sizeBytes: 611_000,
      angle: "other",
      altText: caption,
    },
    caption,
    attachedAt: seed.lastUpdatedAt,
    attachedByUserId: seed.scannedByUserId,
  }));
}

function buildRecord(seed: RecordSeed): ComplianceRecord {
  const checklist = buildChecklist(seed);
  const declarations = buildDeclarations(seed);
  const overallConfidence = Math.round(
    declarations.reduce((sum, d) => sum + d.confidence, 0) / declarations.length
  );

  const record: ComplianceRecord = {
    id: seed.id,
    scanId: seed.scanId,
    productName: seed.productName,
    manufacturerName: seed.manufacturerName,
    category: seed.category,
    region: seed.region,
    source: seed.source,
    verificationStatus: seed.verificationStatus,
    complianceStatus: computeComplianceStatus({
      verificationStatus: seed.verificationStatus,
      needsReviewFlag: seed.needsReviewFlag ?? false,
      checklist,
    }),
    needsReviewFlag: seed.needsReviewFlag ?? false,
    flaggedForEnforcement: seed.flaggedForEnforcement ?? false,
    checklist,
    violations: buildViolations(checklist),
    extraction: {
      scanId: seed.scanId,
      processingStatus: "Completed",
      overallConfidence,
      declarations,
      fontSizeChecks: seed.fontSize ?? [],
      barcodeAnalysis: null,
    },
    evidence: buildEvidence(seed),
    auditTrail: buildAuditTrail(seed),
    thumbnail: placeholderImage(seed.id, seed.category),
    capturedImages: placeholderImages(seed.id, seed.category),
    /*
     * Every seed here is Officer-Scanned, so the officer who scanned it is
     * also the officer it's currently assigned to — nothing has ever
     * reassigned a seed record. `reassignCase()` is the only thing that
     * would ever change this away from `scannedByUserId` (13 §4.2).
     */
    assignedOfficerUserId: seed.scannedByUserId,
    scannedAt: seed.scannedAt,
    lastUpdatedAt: seed.lastUpdatedAt,
    archived: seed.archived ?? false,
  };

  if (seed.verificationStatus === "Verified") {
    record.complianceScore = computeComplianceScore({ checklist });
  }

  if (seed.needsReviewByUserId !== undefined)
    record.needsReviewByUserId = seed.needsReviewByUserId;
  if (seed.needsReviewNote !== undefined)
    record.needsReviewNote = seed.needsReviewNote;
  if (seed.ecommerceListingUrl !== undefined)
    record.ecommerceListingUrl = seed.ecommerceListingUrl;

  return record;
}

const SEEDS: RecordSeed[] = [
  {
    id: "rec-1001",
    scanId: "LMCS-2026-001001",
    productName: "Sahyadri Refined Groundnut Oil 1 L",
    manufacturerName: "Sahyadri Foods Pvt Ltd",
    category: "Packaged Food",
    region: "Maharashtra",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    scannedAt: "2026-09-01T10:22:00+05:30",
    lastUpdatedAt: "2026-09-01T10:41:00+05:30",
    scannedByUserId: "usr-001",
    verifiedByUserId: "usr-001",
    failures: [],
    fontSize: [
      {
        fieldId: "retailSalePrice",
        measuredHeightMm: 4.6,
        requiredHeightMm: 4,
        embossed: false,
        passed: true,
      },
      {
        fieldId: "netQuantity",
        measuredHeightMm: 5.1,
        requiredHeightMm: 4,
        embossed: false,
        passed: true,
      },
    ],
  },
  {
    id: "rec-1002",
    scanId: "LMCS-2026-001002",
    productName: "Ganga Sparkling Lemon 600 ml",
    manufacturerName: "Ganga Beverages Ltd",
    category: "Beverages",
    region: "Uttar Pradesh",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    flaggedForEnforcement: true,
    scannedAt: "2026-08-30T15:05:00+05:30",
    lastUpdatedAt: "2026-08-30T15:38:00+05:30",
    scannedByUserId: "usr-001",
    verifiedByUserId: "usr-001",
    failures: [
      {
        fieldId: "fontSize",
        detail: "MRP numeral height 3 mm, below the required 4 mm minimum",
      },
      { fieldId: "consumerCareDetails" },
    ],
    notDetected: ["consumerCareDetails"],
    confidence: { retailSalePrice: 74 },
    fontSize: [
      {
        fieldId: "retailSalePrice",
        measuredHeightMm: 3,
        requiredHeightMm: 4,
        embossed: false,
        passed: false,
      },
      {
        fieldId: "netQuantity",
        measuredHeightMm: 4.4,
        requiredHeightMm: 4,
        embossed: false,
        passed: true,
      },
    ],
    evidenceCaptions: [
      "Close-up of the MRP declaration showing numeral height against a scale rule",
    ],
  },
  {
    id: "rec-1003",
    scanId: "LMCS-2026-001003",
    productName: "Nilgiri Herbal Shampoo 200 ml",
    manufacturerName: "Nilgiri Personal Care",
    category: "Personal Care",
    region: "Tamil Nadu",
    source: "Citizen-Reported",
    verificationStatus: "Extracted",
    scannedAt: "2026-09-04T18:47:00+05:30",
    lastUpdatedAt: "2026-09-04T18:47:00+05:30",
    scannedByUserId: "usr-001",
    failures: [],
    confidence: { manufacturerDetails: 62, netQuantity: 81 },
  },
  {
    id: "rec-1004",
    scanId: "LMCS-2026-001004",
    productName: "Deccan Floor Cleaner 5 L",
    manufacturerName: "Deccan Household Products",
    category: "Household Cleaning",
    region: "Telangana",
    source: "E-commerce-Sourced",
    verificationStatus: "Verified",
    scannedAt: "2026-08-28T11:15:00+05:30",
    lastUpdatedAt: "2026-08-28T12:02:00+05:30",
    scannedByUserId: "usr-002",
    verifiedByUserId: "usr-002",
    ecommerceListingUrl: "https://marketplace.example.in/listing/deccan-floor-cleaner-5l",
    failures: [
      { fieldId: "manufactureDate" },
      { fieldId: "netQuantity", detail: "Declared as 5000ml without a space or unit break" },
    ],
    notDetected: ["manufactureDate"],
    corrected: ["netQuantity"],
  },
  {
    id: "rec-1005",
    scanId: "LMCS-2026-001005",
    productName: "Meridian Olive Oil 500 ml (Imported)",
    manufacturerName: "Meridian Imports (India)",
    category: "Packaged Food",
    region: "Delhi",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    isImport: true,
    scannedAt: "2026-08-26T09:30:00+05:30",
    lastUpdatedAt: "2026-08-26T09:58:00+05:30",
    scannedByUserId: "usr-002",
    verifiedByUserId: "usr-002",
    failures: [{ fieldId: "countryOfOrigin" }],
    notDetected: ["countryOfOrigin"],
    evidenceCaptions: ["Reverse of the imported pack showing the importer sticker"],
  },
  {
    id: "rec-1006",
    scanId: "LMCS-2026-001006",
    productName: "Konkan Garam Masala 100 g",
    manufacturerName: "Konkan Spice Company",
    category: "Packaged Food",
    region: "Goa",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    needsReviewFlag: true,
    needsReviewByUserId: "usr-003",
    needsReviewNote:
      "Net quantity is printed on a seam and is legible only at an angle. Needs a supervisor's judgement on whether that meets Rule 7.",
    scannedAt: "2026-08-25T14:20:00+05:30",
    lastUpdatedAt: "2026-09-02T10:10:00+05:30",
    scannedByUserId: "usr-001",
    verifiedByUserId: "usr-001",
    failures: [],
    confidence: { netQuantity: 68 },
  },
  {
    id: "rec-1007",
    scanId: "LMCS-2026-001007",
    productName: "Aravalli Cotton Bedsheet Set",
    manufacturerName: "Aravalli Textiles Ltd",
    category: "Textiles and Garments",
    region: "Rajasthan",
    source: "E-commerce-Sourced",
    verificationStatus: "Extracted",
    scannedAt: "2026-09-05T07:55:00+05:30",
    lastUpdatedAt: "2026-09-05T07:55:00+05:30",
    scannedByUserId: "usr-002",
    ecommerceListingUrl: "https://marketplace.example.in/listing/aravalli-bedsheet-set",
    failures: [],
    confidence: { retailSalePrice: 58, manufacturerDetails: 71 },
  },
  {
    id: "rec-1008",
    scanId: "LMCS-2026-001008",
    productName: "Ganga Mixed Fruit Juice 1 L",
    manufacturerName: "Ganga Beverages Ltd",
    category: "Beverages",
    region: "Uttar Pradesh",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    scannedAt: "2026-08-20T13:12:00+05:30",
    lastUpdatedAt: "2026-08-20T13:44:00+05:30",
    scannedByUserId: "usr-001",
    verifiedByUserId: "usr-001",
    failures: [{ fieldId: "retailSalePrice", detail: "Two MRP values printed, one struck through" }],
  },
  {
    id: "rec-1009",
    scanId: "LMCS-2026-001009",
    productName: "Ganga Iced Tea 250 ml",
    manufacturerName: "Ganga Beverages Ltd",
    category: "Beverages",
    region: "Bihar",
    source: "Citizen-Reported",
    verificationStatus: "Verified",
    scannedAt: "2026-08-14T17:40:00+05:30",
    lastUpdatedAt: "2026-08-14T18:05:00+05:30",
    scannedByUserId: "usr-001",
    verifiedByUserId: "usr-001",
    failures: [{ fieldId: "manufacturerDetails" }],
    notDetected: ["manufacturerDetails"],
  },
  {
    id: "rec-1010",
    scanId: "LMCS-2026-001010",
    productName: "Nilgiri Face Wash 150 ml",
    manufacturerName: "Nilgiri Personal Care",
    category: "Personal Care",
    region: "Karnataka",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    scannedAt: "2026-08-12T10:02:00+05:30",
    lastUpdatedAt: "2026-08-12T10:29:00+05:30",
    scannedByUserId: "usr-002",
    verifiedByUserId: "usr-002",
    failures: [],
  },
  {
    id: "rec-1011",
    scanId: "LMCS-2026-001011",
    productName: "Deccan Dishwash Gel 750 ml",
    manufacturerName: "Deccan Household Products",
    category: "Household Cleaning",
    region: "Maharashtra",
    source: "Officer-Scanned",
    verificationStatus: "Extracted",
    scannedAt: "2026-09-05T09:18:00+05:30",
    lastUpdatedAt: "2026-09-05T09:18:00+05:30",
    scannedByUserId: "usr-001",
    failures: [],
    confidence: { consumerCareDetails: 66 },
  },
  {
    id: "rec-1012",
    scanId: "LMCS-2026-000914",
    productName: "Konkan Coconut Oil 500 ml (2025 pack)",
    manufacturerName: "Konkan Spice Company",
    category: "Packaged Food",
    region: "Kerala",
    source: "Officer-Scanned",
    verificationStatus: "Verified",
    archived: true,
    scannedAt: "2026-05-11T12:00:00+05:30",
    lastUpdatedAt: "2026-07-02T09:00:00+05:30",
    scannedByUserId: "usr-002",
    verifiedByUserId: "usr-002",
    failures: [{ fieldId: "genericName", detail: "Declared only as 'Pure Oil'" }],
  },
];

export const MOCK_RECORDS: readonly ComplianceRecord[] = SEEDS.map(buildRecord);

/** Records the app shows by default. Archived rows are excluded until asked for. */
export const MOCK_ACTIVE_RECORDS: readonly ComplianceRecord[] = MOCK_RECORDS.filter(
  (record) => !record.archived
);

export function findMockRecord(id: string): ComplianceRecord | undefined {
  return MOCK_RECORDS.find((record) => record.id === id || record.scanId === id);
}
