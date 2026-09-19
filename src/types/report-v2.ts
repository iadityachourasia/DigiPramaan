/**
 * report-v2.ts — hand-written TS mirror of backend/app/services/reports/
 * schema.py's ReportSnapshotV2 (Phase 13, the Advanced Regulatory Report
 * upgrade). Field names are camelCase throughout, matching the Python
 * side's `model_dump(by_alias=True)` output exactly (pydantic's
 * `to_camel` alias generator there).
 *
 * Deliberately separate from report.ts (System B's ReportDocument/
 * ReportRun/etc., which stays completely untouched) — this is a new,
 * parallel type tree for the real backend's evidence-embedding report
 * only.
 */

export type RuleResultStatus = "PASS" | "FAIL" | "NEEDS_REVIEW" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";

export interface ReportMetadataV2 {
  reportId: string;
  referenceCode: string;
  generatedAt: string;
  generatedByName: string;
  generatedByRole: string;
  generatedByRegion: string | null;
  reportFormatVersion: string;
  ruleSetVersion: string;
}

export interface InspectionInfoV2 {
  inspectionId: string;
  scannedAt: string | null;
  source: string;
  region: string | null;
  category: string | null;
}

export interface ProductInfoV2 {
  productName: string;
  genericName: string | null;
  category: string | null;
  netQuantity: string | null;
  mrp: string | null;
  countryOfOrigin: string | null;
}

export interface ResponsibleEntityV2 {
  role: "manufacturer" | "packer" | "importer" | "brand_owner_or_marketer";
  value: string | null;
  notDetected: boolean;
  corrected: boolean;
}

export interface OverallAssessmentV2 {
  complianceStatus: string;
  complianceScore: number | null;
  complianceBand: string | null;
  verificationStatus: string;
}

export interface ImageReferenceV2 {
  imageId: string;
  angle: string;
  contentHash: string | null;
  uploadedAt: string | null;
  qualityVerdict: string | null;
  imageWidthPx: number | null;
  imageHeightPx: number | null;
}

export interface DeclarationRowV2 {
  fieldId: string;
  label: string;
  observedValue: string | null;
  notDetected: boolean;
  corrected: boolean;
  evidenceImageId: string | null;
  evidenceAngle: string | null;
}

export interface ChecklistRowV2 {
  ruleId: string;
  requirement: string;
  observedValue: string | null;
  result: RuleResultStatus;
  evidenceNote: string | null;
  evidenceImageId: string | null;
  evidenceAngle: string | null;
  officerResolutionNote: string | null;
}

export interface AiExplanationV2 {
  summary: string;
  whatWasFound: string;
  whatIsMissingOrWrong: string;
  legalContext: string;
  evidenceExplanation: string;
  officerGuidance: string;
  insufficientContext: boolean;
}

export interface ViolationDetailV2 {
  ruleId: string | null;
  category: string;
  legalBasis: string;
  detail: string | null;
  result: RuleResultStatus;
  aiExplanation: AiExplanationV2 | null;
  aiExplanationLabel: string;
  originalImage: ImageReferenceV2 | null;
  bbox: number[] | null;
  cropImageRef: string | null;
}

export interface FontMeasurementV2 {
  ruleId: string;
  result: RuleResultStatus;
  message: string;
  fieldId: string | null;
  imageId: string | null;
  calibrationMethod: string | null;
  knownDimensionMm: number | null;
  pixelLength: number | null;
  pixelsPerMm: number | null;
  bbox: number[] | null;
  measuredCharacterHeightPx: number | null;
  measuredHeightMm: number | null;
  confidence: number | null;
  insufficientLegalValidationMessage: string;
}

export interface PlacementEvidenceV2 {
  ruleId: string;
  result: RuleResultStatus;
  expectedPanel: string | null;
  observedPanel: string | null;
  imageId: string | null;
  bbox: number[] | null;
  reason: string | null;
  confidence: number | null;
}

export interface ReadabilityFieldSignalV2 {
  field: string;
  fieldId: string | null;
  angle: string | null;
  ocrConfidence: number | null;
  imageVerdict: string | null;
  recaptureRequired: boolean;
  hasRealEvidence: boolean;
  status: string;
}

export interface ReadabilityEvidenceV2 {
  ruleId: string;
  result: RuleResultStatus;
  languageDetected: string | null;
  languageOk: boolean | null;
  fields: ReadabilityFieldSignalV2[];
}

export interface BarcodeCandidateV2 {
  rawValue: string;
  normalizedValue: string;
  symbology: string;
  checksumValid: boolean;
  sourceImageId: string;
  sourceAngle: string;
  bbox: number[] | null;
  decoder: string;
  detectionMethod: string;
  quality: number;
}

export interface BarcodeEvidenceSectionV2 {
  status: "trusted" | "needs_review" | "none";
  trustedIdentifier: BarcodeCandidateV2 | null;
  candidates: BarcodeCandidateV2[];
}

export interface OfficerResolutionV2 {
  ruleId: string;
  requirement: string;
  resolvedStatus: "PASS" | "FAIL";
  resolvedBy: string;
  resolvedAt: string;
  note: string;
}

export interface OfficerVerificationV2 {
  verifiedByName: string;
  verifiedByRole: string;
  verifiedByRegion: string | null;
  verifiedAt: string | null;
  finalStatus: string;
  resolutions: OfficerResolutionV2[];
  governanceStatement: string;
}

export interface IntegrityBlockV2 {
  reportId: string;
  inspectionId: string;
  generatedAt: string;
  generatedByName: string;
  reportFormatVersion: string;
  ruleSetVersion: string;
  pdfSha256: string | null;
  docxSha256: string | null;
  verifyUrl: string;
}

export interface ReportSnapshotV2 {
  schemaVersion: "2.0";
  reportMetadata: ReportMetadataV2;
  inspection: InspectionInfoV2;
  product: ProductInfoV2;
  responsibleEntities: ResponsibleEntityV2[];
  overallAssessment: OverallAssessmentV2;
  originalImages: ImageReferenceV2[];
  declarations: DeclarationRowV2[];
  complianceChecklist: ChecklistRowV2[];
  violations: ViolationDetailV2[];
  fontMeasurements: FontMeasurementV2[];
  placementEvidence: PlacementEvidenceV2[];
  readabilityEvidence: ReadabilityEvidenceV2[];
  barcodeEvidence: BarcodeEvidenceSectionV2 | null;
  officerVerification: OfficerVerificationV2;
  integrity: IntegrityBlockV2;
}

/** What `renderPdfV2`/`renderDocxV2` (src/lib/server/report-render-v2/)
 * actually consume — the snapshot plus local file paths for the logo and
 * already-fetched/optimized evidence images. The renderer reads these
 * paths; it never fetches anything itself. `src/app/api/internal/
 * render-report/route.ts` (F-003 fix, 2026-09-19) is what builds this:
 * it receives evidence images as base64 bytes over HTTP from the FastAPI
 * backend (which shares no filesystem with this process), writes them to
 * its own request-scoped temp directory, and constructs this exact shape
 * before calling the renderer — the renderer itself never changed. */
export interface RenderReportInputV2 {
  snapshot: ReportSnapshotV2;
  images: {
    front: string | null;
    back: string | null;
    side_pdp: string | null;
    violationCrops: Record<string, string>;
    /** (width, height) in pixels of each file actually written to disk
     * (post-resize), keyed the same way as the paths above ("front" /
     * "back" / "side_pdp" / a crop's own ref) — lets the DOCX renderer
     * size an ImageRun without its own image-dimension-reading
     * dependency. */
    dimensions: Record<string, [number, number]>;
  };
  logoPath: string;
}
