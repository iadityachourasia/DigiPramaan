/**
 * scan.ts — intake and extraction. Covers Scan/Upload (page 3), the extraction side
 * of Declaration Extraction & Verification (page 4), and the E-commerce Listing
 * Scanner (page 8), which produces the same input shape rather than its own.
 */

import type {
  ConfidenceBand,
  ProcessingStatus,
  SourceTag,
  UploadStatus,
  ViolationCategoryId,
} from "./vocabulary";

/** Accepted upload formats, stated visibly before a bad attempt (03 §2). */
export const ACCEPTED_UPLOAD_FORMATS = ["JPG", "JPEG", "PNG", "PDF"] as const;

/**
 * Maximum upload size in megabytes.
 *
 * TODO: BRD §15 Q-04 is unresolved — DoCA has not stated a real limit. 10 MB is a
 * documented placeholder driven by NEXT_PUBLIC_MAX_UPLOAD_MB so it changes in one
 * place once the number arrives. 03-scan-upload.md requires the limit be shown in
 * the UI before a bad attempt, so this value is user-visible, not just a guard.
 */
export const DEFAULT_MAX_UPLOAD_MB = 10;

export interface UploadedImage {
  id: string;
  fileName: string;
  /** Public path or object URL. Never a bare grey placeholder. */
  url: string;
  sizeBytes: number;
  /**
   * Which face of the package this photo shows.
   *
   * `"front"`/`"back"`/`"side_pdp"`/`"additional"` are the four named capture
   * slots from 03-scan-upload.md §2 (Side-PDP = Principal Display Panel,
   * wherever it differs from Front; Additional is the optional 4th slot).
   * `"other"` is the pre-existing, separate concept used for free-form
   * evidence attachments on a record (06 §2) — never for a named slot.
   */
  angle: "front" | "back" | "side_pdp" | "additional" | "other";
  /** Meaningful alt text is mandatory (A-02); never empty for evidence images. */
  altText: string;
}

/* ------------------------------------------------------------------ *
 * Capture wizard (03-scan-upload.md)
 * ------------------------------------------------------------------ */

/** The three required capture slots, plus the optional 4th. */
export const CAPTURE_SLOT_ANGLES = ["front", "back", "side_pdp", "additional"] as const;
export type CaptureSlotAngle = (typeof CAPTURE_SLOT_ANGLES)[number];

/** How the officer chose to get photos into the wizard (03 §2, Step 0). */
export const CAPTURE_MODES = ["device", "camera", "mobile"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

/**
 * Why the Image Quality Inspection Layer rejected a photo (03 §2). Each maps to
 * one specific, user-facing reason — never a generic "upload failed".
 */
export const QUALITY_FAILURE_REASONS = [
  "blur",
  "distortion",
  "curvature",
  "no_text_detected",
] as const;
export type QualityFailureReason = (typeof QUALITY_FAILURE_REASONS)[number];

export interface QualityCheckResult {
  passed: boolean;
  /** Present only when passed is false. */
  failureReason?: QualityFailureReason;
}

/**
 * One capture slot's client-side wizard state. Deliberately NOT part of `Scan`
 * — a slot only becomes part of the real `Scan.images` array once it passes
 * the quality gate. A failed attempt lives only here, transiently, and is
 * discarded on retry (03 §2: "a prior failed attempt leaves no trace... once a
 * later attempt passes").
 */
export type CaptureSlotStatus = "empty" | "capturing" | "checking" | "passed" | "failed";

export interface CaptureSlotState {
  angle: CaptureSlotAngle;
  status: CaptureSlotStatus;
  image?: UploadedImage;
  /** Present only when status is "failed". */
  failureReason?: QualityFailureReason;
}

/* ------------------------------------------------------------------ *
 * Mobile Handoff (03-scan-upload.md §2, Mobile Handoff Panel)
 * ------------------------------------------------------------------ */

/**
 * A phone connecting is a genuinely different browser context from the
 * desktop that generated the QR code — this state has to live somewhere both
 * can reach, which is the one piece of this page's mock layer that cannot be
 * a client-side module (see src/app/api/mobile-sessions/route.ts).
 */
export const MOBILE_SESSION_STATUSES = ["waiting", "connected", "expired", "cancelled"] as const;
export type MobileSessionStatus = (typeof MOBILE_SESSION_STATUSES)[number];

export interface MobileHandoffSession {
  token: string;
  /** Scopes the session to one in-progress scan draft (03 §2). */
  scanDraftId: string;
  status: MobileSessionStatus;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  expiresAt: string;
  /** Grows live as the phone captures and passes each angle. */
  capturedAngles: CaptureSlotAngle[];
  /**
   * The actual passed images, keyed by angle, so the desktop tab receives
   * real evidence photos (not just a "this angle is done" flag) once the scan
   * is ready to submit. `url` is a data: URL — this mock has no object
   * storage, so the image travels as base64 through the same in-memory
   * session record as everything else.
   */
  capturedImages: Partial<Record<CaptureSlotAngle, UploadedImage>>;
}

/* ------------------------------------------------------------------ *
 * Processing Pipeline Tracker (03-scan-upload.md §2, Step 5)
 * ------------------------------------------------------------------ */

/**
 * The 9 stages, in order, exactly as named in 03 §2 plus Phase 8's
 * `barcodeDetection` (deterministic, independent of OCR in both
 * directions — see backend/app/jobs/pipeline.py's own docstring on why
 * it's ordered between fallbackExtraction and structuring). "Quality
 * check" is already resolved before this route is reached (the capture
 * wizard's own gate) — it is created already `completed` here, "for
 * continuity" per spec. Must stay in lockstep with the backend's own
 * `PIPELINE_STAGE_IDS` in jobs/pipeline.py.
 */
export const PIPELINE_STAGE_IDS = [
  "uploading",
  "qualityCheck",
  "textExtraction",
  "fallbackExtraction",
  "barcodeDetection",
  "structuring",
  "ruleEngine",
  "complianceScore",
  "readyForVerification",
] as const;
export type PipelineStageId = (typeof PIPELINE_STAGE_IDS)[number];

/**
 * Five states, not four — "skipped" is its own state so Fallback extraction
 * can be shown as explicitly not needed, never silently omitted (03 §2's own
 * requirement).
 */
export const PIPELINE_STAGE_STATES = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "failed",
] as const;
export type PipelineStageState = (typeof PIPELINE_STAGE_STATES)[number];

export interface PipelineStage {
  id: PipelineStageId;
  state: PipelineStageState;
  /** One-line result, present once completed/skipped/failed (03 §2). */
  summary?: string;
  /** Present only when state is "failed". */
  failureReason?: string;
}

/**
 * Read-only progress of one scan through the pipeline. State that must
 * survive the officer navigating away and back — the same underlying
 * problem Mobile Handoff solves, so it lives behind real Route Handlers
 * (src/app/api/scan-pipelines/) over a server-side store, not a client mock
 * (see src/lib/server/scan-pipeline-store.ts).
 */
export interface PipelineRun {
  scanId: string;
  /** The compliance record this run produces — stable from creation, even
   *  before it's populated, so the tracker can link to it once ready. */
  recordId: string;
  stages: PipelineStage[];
}

/** Product categories route to the right declaration checklist (03 §2). */
export const PRODUCT_CATEGORIES = [
  "Packaged Food",
  "Beverages",
  "Personal Care",
  "Household Cleaning",
  "Pharmaceuticals",
  "Textiles and Garments",
  "Electronics and Appliances",
  "Other",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface ScanMetadata {
  category: ProductCategory;
  /** Optional, autocompletes against known manufacturers. */
  manufacturerName?: string;
  /**
   * Inspection region or state.
   *
   * TODO: BRD §15 Q-05 is unresolved — whether deployment is a central DoCA pilot
   * or state-level changes this field's value list. Mock data uses states.
   */
  region: string;
  /**
   * The product's own name, when the intake path actually knows it.
   *
   * Page 3's capture wizard has no product-name field, so a physically
   * scanned record's name is synthesized from manufacturer + category (see
   * `buildFinalRecord`, and the TODO there). The E-commerce Listing Scanner
   * (page 8) is the first intake path with a real title to pass — a scraped
   * listing's own product title — so this optional field carries it when
   * present, and the synthesized fallback applies only when it isn't.
   */
  productName?: string;
  /**
   * The listing URL behind this scan. Set by BOTH intake paths, distinguished
   * by the record's `source`:
   *   - Officer-Scanned: page 3's optional field, noting that a physically
   *     photographed product is ALSO listed online (00-README.md §E).
   *   - E-commerce-Sourced: page 8's origin URL — the listing the scan was
   *     scraped from, with no physical photo involved at all.
   * `ComplianceRecord.ecommerceListingUrl` receives whichever applies.
   */
  ecommerceListingUrl?: string;
}

export interface Scan {
  id: string;
  images: UploadedImage[];
  metadata: ScanMetadata;
  source: SourceTag;
  uploadStatus: UploadStatus;
  processingStatus: ProcessingStatus;
  /** Populated when uploadStatus or processingStatus is Failed. */
  failureReason?: string;
  /** Set when duplicate detection matched a recent scan (03 §2). */
  duplicateOfScanId?: string;
  /** ISO 8601. */
  createdAt: string;
  createdByUserId: string;
}

/* ------------------------------------------------------------------ *
 * Extracted declarations (page 4)
 * ------------------------------------------------------------------ */

/**
 * The seven mandatory declarations checked under the Rules, each bound to the
 * taxonomy category it maps to when it fails (04 §2).
 */
export const DECLARATION_FIELD_IDS = [
  "manufacturerDetails",
  "genericName",
  "netQuantity",
  "manufactureDate",
  "retailSalePrice",
  "countryOfOrigin",
  "consumerCareDetails",
] as const;
export type DeclarationFieldId = (typeof DECLARATION_FIELD_IDS)[number];

export interface DeclarationFieldDefinition {
  readonly id: DeclarationFieldId;
  /** Taxonomy category applied when this field fails. */
  readonly failsAs: ViolationCategoryId;
  readonly legalBasis: string;
  /** Country of origin applies to imported commodities only. */
  readonly importsOnly: boolean;
}

export const DECLARATION_FIELDS: readonly DeclarationFieldDefinition[] = [
  {
    id: "manufacturerDetails",
    failsAs: "manufacturer-details-missing",
    legalBasis: "Rule 6(a)",
    importsOnly: false,
  },
  {
    id: "genericName",
    failsAs: "generic-name-missing-or-incorrect",
    legalBasis: "Rule 6(b)",
    importsOnly: false,
  },
  {
    id: "netQuantity",
    failsAs: "net-quantity-missing-or-incorrect",
    legalBasis: "Rule 6(c)",
    importsOnly: false,
  },
  {
    id: "manufactureDate",
    failsAs: "manufacture-import-date-missing",
    legalBasis: "Rule 6(d)",
    importsOnly: false,
  },
  {
    id: "retailSalePrice",
    failsAs: "mrp-non-compliance",
    legalBasis: "Rule 6(e)",
    importsOnly: false,
  },
  {
    id: "countryOfOrigin",
    failsAs: "country-of-origin-missing",
    legalBasis: "Rule 6",
    importsOnly: true,
  },
  {
    id: "consumerCareDetails",
    failsAs: "consumer-care-details-missing",
    legalBasis: "Rule 6",
    importsOnly: false,
  },
] as const;

/**
 * One extracted declaration.
 *
 * `notDetected` and a low `confidence` mean different things, and 04 §4 requires
 * they look different: nothing was found, versus something was found and the system
 * is unsure. `corrected` is a third, separate signal — a human changed this value —
 * and needs its own visual treatment again.
 */
export interface ExtractedDeclaration {
  fieldId: DeclarationFieldId;
  /** Null when the pipeline found nothing for this field. */
  value: string | null;
  notDetected: boolean;
  /** 0 to 100. Render as a percentage alongside the derived band. */
  confidence: number;
  band: ConfidenceBand;
  corrected: boolean;
  /** Present when corrected, for the audit trail. */
  correctedByUserId?: string;
  /**
   * Which engine produced this value (13-history-and-hierarchy.md §1.1) — a
   * trust feature so an officer knows when they're looking at a second-opinion
   * read rather than the primary pipeline's own result.
   */
  sourceEngine: "paddleocr" | "gemini_fallback" | "manual";
  /** Which photo this value was read from (13-history-and-hierarchy.md §1.1). */
  sourceImageAngle: "front" | "back" | "side_pdp";
}

/**
 * Rule 7 numeral-height check. Kept as its own structure because 04 §2 is explicit
 * that it must not be flattened into the general confidence score. It is the
 * PS-specific check a judge will look for.
 *
 * MRP and net-quantity numerals require a minimum 4 mm height, or 6 mm where the
 * declaration is blown, moulded or embossed onto the container.
 */
export interface FontSizeCheck {
  fieldId: Extract<DeclarationFieldId, "netQuantity" | "retailSalePrice">;
  measuredHeightMm: number;
  requiredHeightMm: number;
  /** True where the declaration is blown, moulded or embossed. */
  embossed: boolean;
  passed: boolean;
}

export interface ExtractionResult {
  scanId: string;
  processingStatus: ProcessingStatus;
  /** 0 to 100 summary shown at the top of the right panel. */
  overallConfidence: number;
  declarations: ExtractedDeclaration[];
  fontSizeChecks: FontSizeCheck[];
  /** Populated when processingStatus is Failed. */
  failureReason?: string;
  /** Phase 8 — deterministic barcode/GTIN detection, never Gemini-decided
   * (see backend services/barcode/'s own docstrings). null only for a
   * record created before Phase 8; a Phase-8-processed scan always gets a
   * real BarcodeAnalysis, even when its own status is "none". */
  barcodeAnalysis: BarcodeAnalysis | null;
}

/** One successful decode — either a full-image pass or a cropped candidate
 * region. Mirrors the backend's BarcodeDecodeResult exactly (camelCase). */
export interface BarcodeDecodeResult {
  rawValue: string;
  normalizedValue: string;
  symbology: "EAN_13" | "EAN_8" | "UPC_A" | "UPC_E" | "ITF";
  checksumValid: boolean;
  sourceImageId: string;
  sourceAngle: Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">;
  /** Natural-pixel [x0,y0,x1,y1] — same coordinate space ImageViewer's
   * `highlightBbox` prop already expects. */
  bbox: [number, number, number, number] | null;
  decoder: "zxing_full_image" | "zxing_crop";
  detectionMethod: "full_image" | "cropped_candidate";
  quality: number;
}

export interface BarcodeAnalysis {
  candidates: BarcodeDecodeResult[];
  trustedIdentifier: BarcodeDecodeResult | null;
  status: "trusted" | "needs_review" | "none";
}

/* ------------------------------------------------------------------ *
 * E-commerce intake (page 8)
 * ------------------------------------------------------------------ */

export type EcommerceScanMode = "single" | "bulk";

export interface ScrapedListing {
  id: string;
  listingUrl: string;
  title: string;
  descriptionExcerpt: string;
  images: UploadedImage[];
  /** Per-listing state inside a bulk batch queue. */
  status: "queued" | "scanning" | "done" | "failed";
  /** Set when a platform rate-limits or blocks the fetch (BRD R-03). */
  failureReason?: string;
  /** Present once the listing has produced a compliance record. */
  recordId?: string;
}

export interface EcommerceBatch {
  id: string;
  /** Category or search-results URL the batch was seeded from. */
  sourceUrl: string;
  listings: ScrapedListing[];
  createdAt: string;
}
