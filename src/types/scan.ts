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
  /** Which face of the package this photo shows, for multi-angle scans. */
  angle: "front" | "back" | "ingredients" | "other";
  /** Meaningful alt text is mandatory (A-02); never empty for evidence images. */
  altText: string;
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
   * Optional. Notes that a physically photographed product is ALSO listed online.
   * 00-README.md §E: this is not the e-commerce scanning path. A scan that starts
   * from an online listing with no physical photo belongs to page 8 instead.
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
