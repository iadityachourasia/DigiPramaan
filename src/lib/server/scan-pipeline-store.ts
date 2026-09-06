/**
 * scan-pipeline-store.ts — server-side state for the Processing Pipeline
 * Tracker (03-scan-upload.md §2, Step 5).
 *
 * SAME REASON AS mobile-session-store.ts, DIFFERENT MODULE
 * ----------------------------------------------------------
 * "Officer navigates away mid-pipeline, returns later, must resume rather
 * than restart" is the same underlying problem mobile handoff already
 * solved — state that must survive a closed tab, so it can't be a
 * client-bundled mock (every tab would get its own copy). This reuses that
 * solution's *mechanism* (an in-memory Map behind real Route Handlers) but
 * not its module: the key is a scan ID, not a mobile token; a pipeline
 * run's terminal output (the compliance record) must outlive the run
 * itself, unlike a mobile session; and state advances on *elapsed wall-clock
 * time*, not in response to explicit client actions like connect/capture.
 *
 * TIME-DERIVED STATE, NOT A BACKGROUND TIMER
 * -------------------------------------------
 * Exactly like `withResolvedStatus()` derives "expired" from a stored
 * timestamp + `Date.now()` rather than a live timer, `withAdvancedStages()`
 * derives how far a run has progressed from `currentStageStartedAt` on every
 * read. A poll after a long gap (tab was closed) fast-forwards correctly
 * through however many stages have "elapsed" since — there is no
 * `setTimeout` chain to survive a server restart or module reload.
 *
 * STAGE OUTCOMES ARE SEEDED AT CREATION, NOT COMPUTED LIVE
 * -----------------------------------------------------------
 * Which field needed fallback, the violation count, the compliance score —
 * all decided once when the run is created, not derived from a prior
 * stage's actual (mock) output. This is why a stage-scoped retry never has
 * anything downstream to invalidate: nothing downstream has run yet (a
 * failed stage blocks all forward progress by construction), and what it
 * will find when it does run was never data-dependent on which attempt at
 * an earlier stage succeeded.
 */

import {
  DECLARATION_FIELD_SOURCE_ANGLE,
  MOCK_MANUFACTURERS,
  SAMPLE_VALUES,
} from "@/lib/mock";
/*
 * Imported directly from the specific mock module, not the `@/lib/mock`
 * barrel — the barrel re-exports this file's own `getRecordById`'s sibling
 * lookup, and going through it here would create a real import cycle
 * (mock barrel -> records.ts -> this file -> mock barrel). Importing the one
 * function needed directly from its file avoids that without changing what
 * either module exports.
 */
import { findMockRecord, MOCK_ACTIVE_RECORDS } from "@/lib/mock/records";
import {
  computeComplianceScore,
  computeComplianceStatus,
  confidenceBand,
  DECLARATION_FIELDS,
  PIPELINE_STAGE_IDS,
  violationCategory,
  type AuditEvent,
  type CaptureSlotAngle,
  type ComplianceRecord,
  type DeclarationCheck,
  type DeclarationFieldId,
  type ExtractedDeclaration,
  type PipelineStage,
  type PipelineStageId,
  type RecordFilters,
  type RecordSort,
  type RecordsPage,
  type ScanMetadata,
  type UploadedImage,
  type Violation,
} from "@/types";

/** Mock processing time per stage. Quality check and Ready-for-verification are instant. */
const STAGE_DURATION_MS: Record<PipelineStageId, number> = {
  uploading: 500,
  qualityCheck: 0,
  textExtraction: 900,
  fallbackExtraction: 700,
  structuring: 700,
  ruleEngine: 600,
  complianceScore: 300,
  readyForVerification: 0,
};

/** Stages a `?demo=pipeline-fail-<id>` override may target — not the two instant/pre-resolved ones. */
const FORCEABLE_STAGES: readonly PipelineStageId[] = [
  "uploading",
  "textExtraction",
  "fallbackExtraction",
  "structuring",
  "ruleEngine",
  "complianceScore",
];

const FAILURE_REASON: Record<PipelineStageId, string> = {
  uploading: "Upload interrupted — connection lost partway through.",
  qualityCheck: "Quality check could not run.",
  textExtraction: "OCR engine timed out processing one or more images.",
  fallbackExtraction: "Fallback engine unavailable — try again.",
  structuring: "Could not reconcile fields across the three images.",
  ruleEngine: "Rule engine evaluation failed unexpectedly.",
  complianceScore: "Could not compute a compliance score.",
  readyForVerification: "Could not finalize the record.",
};

export interface CreatePipelineRunInput {
  scanId: string;
  metadata: ScanMetadata;
  images: Array<{ angle: CaptureSlotAngle; fileName: string; url: string; sizeBytes: number }>;
  scannedByUserId: string;
  /** `?demo=pipeline-fail-<id>` — forces that one stage to fail once. */
  forceFailStage?: PipelineStageId;
  /** `?demo=fallback-used` / `?demo=no-fallback` — omitted means the default (used). */
  fallbackOverride?: "used" | "skipped";
  /** `?demo=zero-declarations` — seeds a total-OCR-failure record (04's edge case). */
  forceZeroDeclarations?: boolean;
}

interface SeededDeclarations {
  declarations: ExtractedDeclaration[];
  checklist: DeclarationCheck[];
  violations: Violation[];
  fallbackNeeded: boolean;
  fallbackFieldLabel: string | null;
}

/**
 * The scenario every run seeds by default: an imported product (so Country
 * of Origin is a checked field, matching 03 §2's own illustrative example —
 * "Fallback used for 1 field: Country of Origin"), one deliberate font-size
 * failure so the Rule engine's summary has something real to report, and
 * high confidence everywhere else. `?demo=no-fallback` keeps the same
 * scenario but with Country of Origin extracted cleanly on the first pass.
 */
/**
 * `allMissing` seeds a total-OCR-failure record (04-extraction-verification.md's
 * "OCR failed entirely" edge case) — every field notDetected, for testing
 * Retry OCR / Manual Entry without waiting on a real total failure to occur.
 */
function seedDeclarations(fallbackNeeded: boolean, allMissing = false): SeededDeclarations {
  /* The default scenario is always an import — otherwise Country of Origin
   * isn't a checked field at all, and 03 §2's own illustrative fallback
   * example ("Fallback used for 1 field: Country of Origin") has nothing to
   * demonstrate against. */
  const fields = DECLARATION_FIELDS;

  const declarations: ExtractedDeclaration[] = fields.map((field, index) => {
    const isFallbackField = fallbackNeeded && field.id === "countryOfOrigin";
    const confidence = allMissing ? 0 : isFallbackField ? 82 : 92 + (index % 6);
    return {
      fieldId: field.id,
      value: allMissing ? null : SAMPLE_VALUES[field.id],
      notDetected: allMissing,
      confidence,
      band: confidenceBand(confidence),
      corrected: false,
      sourceEngine: isFallbackField ? "gemini_fallback" : "paddleocr",
      sourceImageAngle: DECLARATION_FIELD_SOURCE_ANGLE[field.id],
    };
  });

  const declarationChecklist: DeclarationCheck[] = fields.map((field) =>
    allMissing
      ? {
          fieldId: field.id,
          passed: false,
          value: null,
          violationCategoryId: field.failsAs,
          detail: "Not detected by OCR",
        }
      : { fieldId: field.id, passed: true, value: SAMPLE_VALUES[field.id] }
  );

  /* One deliberate, always-present violation — otherwise the Rule engine
   * stage has nothing real to report, and "3 rule violations found" (03 §2's
   * own example wording) becomes untestable. */
  const fontSizeLine: DeclarationCheck = {
    fieldId: "fontSize",
    passed: false,
    value: null,
    violationCategoryId: "font-size-readability-failure",
    detail: "MRP numeral height 3 mm, below the required 4 mm minimum",
  };

  const checklist = [...declarationChecklist, fontSizeLine];

  const violations: Violation[] = checklist
    .filter((line): line is DeclarationCheck & { violationCategoryId: NonNullable<DeclarationCheck["violationCategoryId"]> } =>
      !line.passed && line.violationCategoryId !== undefined
    )
    .map((line) => {
      const definition = violationCategory(line.violationCategoryId);
      const violation: Violation = {
        categoryId: definition.id,
        category: definition.category,
        legalBasis: definition.legalBasis,
      };
      if (line.detail !== undefined) violation.detail = line.detail;
      return violation;
    });

  return {
    declarations,
    checklist,
    violations,
    fallbackNeeded,
    fallbackFieldLabel: fallbackNeeded ? "Country of Origin" : null,
  };
}

interface StoredPipelineRun {
  scanId: string;
  recordId: string;
  stages: PipelineStage[];
  /** ISO 8601 — when the current (first non-terminal) stage began. */
  currentStageStartedAt: string;
  forceFailStage?: PipelineStageId;
  seeded: SeededDeclarations;
  metadata: ScanMetadata;
  images: Array<{ angle: CaptureSlotAngle; fileName: string; url: string; sizeBytes: number }>;
  scannedByUserId: string;
  createdAt: string;
  /** Populated once `readyForVerification` completes. */
  record?: ComplianceRecord;
}

const runs = new Map<string, StoredPipelineRun>();

function initialStages(): PipelineStage[] {
  return PIPELINE_STAGE_IDS.map((id) =>
    id === "qualityCheck"
      ? {
          id,
          state: "completed" as const,
          summary: "All images passed the quality gate before this screen.",
        }
      : { id, state: "pending" as const }
  );
}

function stageSummary(run: StoredPipelineRun, stageId: PipelineStageId): string {
  const { declarations, violations, fallbackFieldLabel } = run.seeded;
  const highConfidenceCount = declarations.filter((d) => d.band === "High").length;

  switch (stageId) {
    case "uploading":
      return `${run.images.length} image${run.images.length === 1 ? "" : "s"} uploaded successfully.`;
    case "textExtraction":
      return `OCR complete — ${highConfidenceCount} of ${declarations.length} fields ≥90% confidence.`;
    case "fallbackExtraction":
      return `Fallback used for 1 field: ${fallbackFieldLabel}.`;
    case "structuring":
      return "Fields reconciled across all captured images.";
    case "ruleEngine":
      return violations.length === 0
        ? "No rule violations found."
        : `${violations.length} rule violation${violations.length === 1 ? "" : "s"} found.`;
    case "complianceScore": {
      const score = computeMockComplianceScore(run);
      return `Compliance score: ${score}/100.`;
    }
    case "readyForVerification":
      return "Ready for verification.";
    default:
      return "";
  }
}

function computeMockComplianceScore(run: StoredPipelineRun): number {
  const total = run.seeded.checklist.length;
  const passed = run.seeded.checklist.filter((line) => line.passed).length;
  return Math.round((passed / total) * 100);
}

function buildFinalRecord(run: StoredPipelineRun): ComplianceRecord {
  const { metadata, images, scannedByUserId, seeded } = run;
  const now = new Date().toISOString();

  const categorySlug = metadata.category.toLowerCase().replace(/[^a-z]+/g, "-");
  const ANGLE_LABEL: Record<"front" | "back" | "side_pdp", string> = {
    front: "Front",
    back: "Back",
    side_pdp: "Side — Principal Display Panel",
  };

  /*
   * The pipeline's own input already carries all three captured angles
   * (`run.images`) — this is where they become the page 4 two-panel
   * viewer's data, not just a thumbnail. Falls back to a placeholder per
   * angle when nothing was actually captured (e.g. the zero-declaration
   * demo record, created with `images: []`).
   */
  const capturedImages: UploadedImage[] = (["front", "back", "side_pdp"] as const).map((angle) => {
    const captured = images.find((img) => img.angle === angle);
    return captured
      ? { id: `${run.recordId}-img-${angle}`, altText: `${ANGLE_LABEL[angle]} of the scanned package`, ...captured }
      : {
          id: `${run.recordId}-img-${angle}`,
          fileName: `placeholder-${angle}.svg`,
          url: `/images/placeholder/${categorySlug}.svg`,
          sizeBytes: 0,
          angle,
          altText: `Placeholder — no ${ANGLE_LABEL[angle].toLowerCase()} image was captured for this scan`,
        };
  });
  const thumbnail = capturedImages[0]!;

  /*
   * TODO: the Scan Capture Wizard's metadata form (03-scan-upload.md §2 Step
   * 4) has no product-name field — only category/manufacturer/region/e-commerce
   * URL. Synthesizing a name here rather than silently leaving it blank;
   * revisit if/when the wizard's metadata gains a real product-name field.
   */
  const manufacturerName =
    metadata.manufacturerName ??
    MOCK_MANUFACTURERS[0]?.name ??
    "Unregistered manufacturer";
  const productName = `${manufacturerName} — ${metadata.category}`;

  const record: ComplianceRecord = {
    id: run.recordId,
    scanId: `LMCS-${new Date().getFullYear()}-${run.scanId.replace(/[^0-9]/g, "").slice(-6).padStart(6, "0")}`,
    productName,
    manufacturerName,
    category: metadata.category,
    region: metadata.region,
    source: "Officer-Scanned",
    verificationStatus: "Extracted",
    complianceStatus: computeComplianceStatus({
      verificationStatus: "Extracted",
      needsReviewFlag: false,
      checklist: seeded.checklist,
    }),
    needsReviewFlag: false,
    flaggedForEnforcement: false,
    checklist: seeded.checklist,
    violations: seeded.violations,
    extraction: {
      scanId: run.scanId,
      processingStatus: "Completed",
      overallConfidence: Math.round(
        seeded.declarations.reduce((sum, d) => sum + d.confidence, 0) / seeded.declarations.length
      ),
      declarations: seeded.declarations,
      fontSizeChecks: [
        { fieldId: "retailSalePrice", measuredHeightMm: 3, requiredHeightMm: 4, embossed: false, passed: false },
        { fieldId: "netQuantity", measuredHeightMm: 5, requiredHeightMm: 4, embossed: false, passed: true },
      ],
    },
    evidence: [],
    auditTrail: [
      { id: `${run.recordId}-audit-1`, type: "Scanned", at: run.createdAt, byUserId: scannedByUserId },
      { id: `${run.recordId}-audit-2`, type: "Extracted", at: now, note: "Automated extraction completed." },
    ],
    thumbnail,
    capturedImages,
    scannedAt: run.createdAt,
    lastUpdatedAt: now,
    archived: false,
  };

  if (metadata.ecommerceListingUrl !== undefined) {
    record.ecommerceListingUrl = metadata.ecommerceListingUrl;
  }

  return record;
}

/** Advances a run as far as elapsed time allows, stopping at a failed or not-yet-elapsed stage. */
function withAdvancedStages(run: StoredPipelineRun): StoredPipelineRun {
  let progressed = true;

  while (progressed) {
    progressed = false;
    const index = run.stages.findIndex((s) => s.state === "pending" || s.state === "in_progress");
    if (index === -1) break;
    const stage = run.stages[index]!;

    if (stage.state === "pending") {
      stage.state = "in_progress";
      run.currentStageStartedAt = new Date().toISOString();
      progressed = true;
      continue;
    }

    const elapsedMs = Date.now() - new Date(run.currentStageStartedAt).getTime();
    if (elapsedMs < STAGE_DURATION_MS[stage.id]) break;

    if (run.forceFailStage === stage.id) {
      stage.state = "failed";
      stage.failureReason = FAILURE_REASON[stage.id];
      delete run.forceFailStage;
      break;
    }

    if (stage.id === "fallbackExtraction" && !run.seeded.fallbackNeeded) {
      stage.state = "skipped";
      stage.summary = "Not needed — all fields extracted with high confidence.";
    } else {
      stage.state = "completed";
      stage.summary = stageSummary(run, stage.id);
      if (stage.id === "readyForVerification") {
        run.record = buildFinalRecord(run);
      }
    }
    progressed = true;
  }

  return run;
}

function toPublicRun(run: StoredPipelineRun): { scanId: string; recordId: string; stages: PipelineStage[] } {
  return { scanId: run.scanId, recordId: run.recordId, stages: run.stages };
}

export function createPipelineRun(input: CreatePipelineRunInput) {
  const fallbackNeeded = input.fallbackOverride === "skipped" ? false : true;
  const seeded = seedDeclarations(fallbackNeeded, input.forceZeroDeclarations ?? false);
  const now = new Date().toISOString();

  const run: StoredPipelineRun = {
    scanId: input.scanId,
    recordId: `rec-${input.scanId}`,
    stages: initialStages(),
    currentStageStartedAt: now,
    metadata: input.metadata,
    images: input.images,
    scannedByUserId: input.scannedByUserId,
    createdAt: now,
    seeded,
  };

  if (input.forceFailStage && FORCEABLE_STAGES.includes(input.forceFailStage)) {
    run.forceFailStage = input.forceFailStage;
  }

  runs.set(run.scanId, run);
  return toPublicRun(withAdvancedStages(run));
}

export function getPipelineRun(scanId: string) {
  const run = runs.get(scanId);
  if (!run) return undefined;
  return toPublicRun(withAdvancedStages(run));
}

/** Returns undefined if the run doesn't exist or the named stage isn't currently failed. */
export function retryPipelineStage(scanId: string, stageId: PipelineStageId) {
  const run = runs.get(scanId);
  if (!run) return undefined;
  const stage = run.stages.find((s) => s.id === stageId);
  if (!stage || stage.state !== "failed") return undefined;

  stage.state = "in_progress";
  delete stage.failureReason;
  run.currentStageStartedAt = new Date().toISOString();
  return toPublicRun(withAdvancedStages(run));
}

/** The compliance record a completed run produced — undefined until `readyForVerification`. */
export function getCreatedRecord(recordId: string): ComplianceRecord | undefined {
  for (const run of runs.values()) {
    if (run.recordId === recordId && run.record) return run.record;
  }
  return undefined;
}

function findRunByRecordId(recordId: string): StoredPipelineRun | undefined {
  for (const run of runs.values()) {
    if (run.recordId === recordId) return run;
  }
  return undefined;
}

/*
 * Declaration Extraction & Verification (page 4) reads and mutates a record
 * through the functions below. Page 4 has two real entry points — a
 * freshly-piped record (this store only) and an already-Verified record
 * re-opened later — so `getRecordById` composes this store's own lookup
 * with the static-seed fallback rather than each caller doing that
 * composition itself. `getCreatedRecord` above is left untouched for the
 * pipeline's own internal use.
 */
export function getRecordById(id: string): ComplianceRecord | undefined {
  return getCreatedRecord(id) ?? findMockRecord(id);
}

function nextAuditEventId(record: ComplianceRecord): string {
  return `${record.id}-audit-${record.auditTrail.length + 1}`;
}

export interface CorrectionResult {
  record: ComplianceRecord;
}

/**
 * One inline field correction (04 §3). Only mutates a record this store
 * actually owns — a static-seed record (found only via the mock fallback)
 * has nowhere to persist a write, so callers must check `getCreatedRecord`
 * themselves first if they need to distinguish "not writable" from
 * "not found" (the Route Handler does this).
 */
export function applyCorrection(
  recordId: string,
  fieldId: DeclarationFieldId,
  value: string,
  userId: string
): CorrectionResult | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  const record = run.record;

  const declaration = record.extraction.declarations.find((d) => d.fieldId === fieldId);
  if (!declaration) return undefined;

  declaration.value = value;
  declaration.notDetected = false;
  declaration.corrected = true;
  declaration.correctedByUserId = userId;
  declaration.sourceEngine = "manual";

  const checklistLine = record.checklist.find((line) => line.fieldId === fieldId);
  if (checklistLine) {
    checklistLine.value = value;
    checklistLine.passed = true;
    delete checklistLine.violationCategoryId;
    delete checklistLine.detail;
  }

  const fieldDefinition = DECLARATION_FIELDS.find((f) => f.id === fieldId);
  record.violations = record.violations.filter(
    (v) => !fieldDefinition || v.categoryId !== fieldDefinition.failsAs
  );

  record.complianceStatus = computeComplianceStatus(record);
  record.lastUpdatedAt = new Date().toISOString();

  const event: AuditEvent = {
    id: nextAuditEventId(record),
    type: "Corrected",
    at: record.lastUpdatedAt,
    byUserId: userId,
    note: `Corrected ${fieldId}`,
  };
  record.auditTrail.push(event);

  return { record };
}

export interface VerifyResult {
  record: ComplianceRecord;
  /** Non-empty when Confirm & Verify was blocked — field ids still missing. */
  blockedFields: DeclarationFieldId[];
}

/**
 * Confirm & Verify (04 §4). Blocked when any declaration is still
 * `notDetected` — 04's own edge-case table names "missing required fields"
 * as the one thing that blocks this action; a merely low-confidence,
 * uncorrected field does not.
 */
export function verifyRecord(recordId: string, userId: string): VerifyResult | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  const record = run.record;

  const blockedFields = record.extraction.declarations
    .filter((d) => d.notDetected)
    .map((d) => d.fieldId);
  if (blockedFields.length > 0) {
    return { record, blockedFields };
  }

  const now = new Date().toISOString();
  record.verificationStatus = "Verified";
  record.complianceStatus = computeComplianceStatus(record);
  record.complianceScore = computeComplianceScore(record);
  record.lastUpdatedAt = now;

  const event: AuditEvent = {
    id: nextAuditEventId(record),
    type: "Verified",
    at: now,
    byUserId: userId,
  };
  record.auditTrail.push(event);

  return { record, blockedFields: [] };
}

/**
 * Flag as Needs Review — available to all three roles (00-README.md §C).
 * Only sets `needsReviewFlag`; Verification Status is untouched, since
 * nothing in the vocabulary ties this action to the Extracted/Verified
 * transition.
 *
 * `flag` defaults to `true` so every existing caller (page 4, page 5's
 * per-row action) is unaffected — page 6 is the first caller that passes
 * `false`, to relabel an already-flagged record's action into "clear"
 * rather than leaving it as an unexplained duplicate flag
 * (06-product-compliance-detail.md's States & Edge Cases table). No
 * AuditEvent on the clear direction, same reasoning already applied to
 * `bulkSetNeedsReview`'s `flag: false` path — the fixed `AuditEventType`
 * vocabulary has no "un-flagged" literal.
 */
export function flagRecordNeedsReview(
  recordId: string,
  userId: string,
  note?: string,
  flag = true
): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  const record = run.record;

  record.needsReviewFlag = flag;
  if (flag) {
    record.needsReviewByUserId = userId;
    if (note) record.needsReviewNote = note;
  } else {
    delete record.needsReviewByUserId;
    delete record.needsReviewNote;
  }
  record.complianceStatus = computeComplianceStatus(record);
  record.lastUpdatedAt = new Date().toISOString();

  if (flag) {
    const event: AuditEvent = {
      id: nextAuditEventId(record),
      type: "Flagged as Needs Review",
      at: record.lastUpdatedAt,
      byUserId: userId,
      ...(note ? { note } : {}),
    };
    record.auditTrail.push(event);
  }

  return record;
}

/**
 * Flag for Enforcement (06 §7) — Enforcement Officer/Admin only
 * (00-README.md §C). One-way: nothing in the spec or the Role Permission
 * Matrix describes un-flagging an enforcement case, so unlike Needs
 * Review this has no `flag` parameter — the route/UI relabel the action to
 * a disabled, already-done state instead (06's "disabled/relabeled to
 * avoid double-flagging").
 */
export function flagRecordForEnforcement(
  recordId: string,
  userId: string
): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  const record = run.record;

  record.flaggedForEnforcement = true;
  record.lastUpdatedAt = new Date().toISOString();

  const event: AuditEvent = {
    id: nextAuditEventId(record),
    type: "Flagged for Enforcement",
    at: record.lastUpdatedAt,
    byUserId: userId,
  };
  record.auditTrail.push(event);

  return record;
}

/**
 * Retry OCR (04's "OCR failed entirely" edge case). Re-seeds this record's
 * declarations as a fresh, successful extraction — the same mock
 * simplification the pipeline's own stage-scoped retry already makes
 * (§5 of the plan): a retry always succeeds, since nothing here models a
 * second real OCR attempt.
 */
export function retryExtractionForRecord(recordId: string): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;

  const fresh = seedDeclarations(run.seeded.fallbackNeeded, false);
  run.seeded = fresh;
  const record = run.record;
  record.extraction.declarations = fresh.declarations;
  record.extraction.overallConfidence = Math.round(
    fresh.declarations.reduce((sum, d) => sum + d.confidence, 0) / fresh.declarations.length
  );
  record.checklist = fresh.checklist;
  record.violations = fresh.violations;
  record.complianceStatus = computeComplianceStatus(record);
  record.lastUpdatedAt = new Date().toISOString();

  return record;
}

/**
 * Direct-testability convenience for a page-4-only demo, mirroring
 * `useScanPipeline`'s own "auto-create when nothing exists yet" pattern:
 * builds and completes a whole run synchronously so `/extraction/[id]` can
 * be opened straight to a zero-declaration record without stepping through
 * the wizard and pipeline first.
 */
export function createZeroDeclarationDemoRecord(scannedByUserId: string): ComplianceRecord {
  const scanId = `demo-zero-${Date.now()}`;
  const now = new Date().toISOString();

  /*
   * Built directly with every stage already `completed`, rather than through
   * `createPipelineRun` + `withAdvancedStages` — that path advances on real
   * elapsed wall-clock time (900ms for OCR, etc.), which a synchronous
   * request handler cannot fast-forward through. This demo only needs the
   * finished record, not a real stage-by-stage animation.
   */
  const run: StoredPipelineRun = {
    scanId,
    recordId: `rec-${scanId}`,
    stages: PIPELINE_STAGE_IDS.map((id) => ({ id, state: "completed" as const })),
    currentStageStartedAt: now,
    metadata: { category: "Other", region: "Delhi" },
    images: [],
    scannedByUserId,
    createdAt: now,
    seeded: seedDeclarations(false, true),
  };
  run.record = buildFinalRecord(run);
  runs.set(run.scanId, run);
  return run.record;
}

/*
 * Compliance Records (page 5) reads and mutates the whole record set
 * through the functions below.
 */

/** Every record a pipeline run has produced so far — the list equivalent of `getCreatedRecord`. */
function getAllCreatedRecords(): ComplianceRecord[] {
  const out: ComplianceRecord[] = [];
  for (const run of runs.values()) {
    if (run.record) out.push(run.record);
  }
  return out;
}

function matchesFilters(record: ComplianceRecord, filters: RecordFilters): boolean {
  if (filters.query) {
    const q = filters.query.toLowerCase();
    const haystack = `${record.productName} ${record.manufacturerName} ${record.scanId}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filters.dateFrom && record.scannedAt < filters.dateFrom) return false;
  if (filters.dateTo && record.scannedAt > filters.dateTo) return false;
  if (filters.categories.length > 0 && !filters.categories.includes(record.category)) return false;
  if (
    filters.complianceStatuses.length > 0 &&
    !filters.complianceStatuses.includes(record.complianceStatus)
  )
    return false;
  if (filters.regions.length > 0 && !filters.regions.includes(record.region)) return false;
  if (
    filters.manufacturers.length > 0 &&
    !filters.manufacturers.includes(record.manufacturerName)
  )
    return false;
  if (filters.sources.length > 0 && !filters.sources.includes(record.source)) return false;
  return true;
}

/** `relevance` only means something alongside a search query; falls back to newest-first without one. */
function sortRecords(
  records: ComplianceRecord[],
  sort: RecordSort,
  query: string | undefined
): ComplianceRecord[] {
  const sorted = [...records];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
    case "alphabetical":
      return sorted.sort((a, b) => a.productName.localeCompare(b.productName));
    case "status":
      return sorted.sort((a, b) => a.complianceStatus.localeCompare(b.complianceStatus));
    case "relevance": {
      if (!query) return sorted.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
      const q = query.toLowerCase();
      return sorted.sort((a, b) => {
        const aFirst = a.productName.toLowerCase().startsWith(q) ? 0 : 1;
        const bFirst = b.productName.toLowerCase().startsWith(q) ? 0 : 1;
        return aFirst - bFirst || b.scannedAt.localeCompare(a.scannedAt);
      });
    }
    case "newest":
    default:
      return sorted.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  }
}

/**
 * List/filter/sort/paginate for Compliance Records (05 §2). Merges live
 * pipeline-created records with the static seeds — `getRecordById`'s same
 * two-source composition, at list scope. Archived records are excluded
 * unconditionally; this page has no "show archived" view (see the page 5
 * plan's Open Question 3).
 */
export function listRecords(
  filters: RecordFilters,
  sort: RecordSort,
  page: number,
  pageSize: number
): RecordsPage {
  const seen = new Set<string>();
  const all = [...getAllCreatedRecords(), ...MOCK_ACTIVE_RECORDS].filter((record) => {
    if (record.archived || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });

  const filtered = all.filter((record) => matchesFilters(record, filters));
  const sorted = sortRecords(filtered, sort, filters.query);
  const start = (page - 1) * pageSize;

  return {
    rows: sorted.slice(start, start + pageSize),
    totalCount: filtered.length,
    page,
    pageSize,
  };
}

/**
 * Archive (Admin-only per 00-README.md §C). Same accepted limitation as
 * every other mutation here: a static-seed record has no backing store to
 * write to and this returns `undefined` for one, same as `applyCorrection`.
 */
export function archiveRecord(recordId: string): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  run.record.archived = true;
  run.record.lastUpdatedAt = new Date().toISOString();
  return run.record;
}

export interface BulkNeedsReviewResult {
  updated: ComplianceRecord[];
  /** Ids that couldn't be written to — static-seed records, or ids that don't resolve at all. */
  skipped: string[];
}

/**
 * Bulk status change (05 §2), scoped to exactly Flag/Clear Needs Review —
 * the one Compliance Status value that's a manual override rather than
 * computed (00-README.md §A). Loops `flagRecordNeedsReview`'s own logic
 * rather than an arbitrary bulk status write, so `computeComplianceStatus()`
 * stays the only thing that ever sets Compliant/Non-Compliant.
 *
 * No AuditEvent is pushed for the `flag: false` (clear) direction — the
 * fixed `AuditEventType` vocabulary (compliance.ts) has no "un-flagged"
 * literal, and inventing one here would be exactly the kind of vocabulary
 * drift this codebase avoids everywhere else. The state change itself
 * (`needsReviewFlag`, `lastUpdatedAt`) still applies either way.
 */
export function bulkSetNeedsReview(
  recordIds: string[],
  userId: string,
  flag: boolean
): BulkNeedsReviewResult {
  const updated: ComplianceRecord[] = [];
  const skipped: string[] = [];

  for (const recordId of recordIds) {
    const run = findRunByRecordId(recordId);
    if (!run?.record) {
      skipped.push(recordId);
      continue;
    }
    const record = run.record;

    record.needsReviewFlag = flag;
    if (flag) {
      record.needsReviewByUserId = userId;
    } else {
      delete record.needsReviewByUserId;
      delete record.needsReviewNote;
    }
    record.complianceStatus = computeComplianceStatus(record);
    record.lastUpdatedAt = new Date().toISOString();

    if (flag) {
      record.auditTrail.push({
        id: nextAuditEventId(record),
        type: "Flagged as Needs Review",
        at: record.lastUpdatedAt,
        byUserId: userId,
        note: "Bulk action",
      });
    }

    updated.push(record);
  }

  return { updated, skipped };
}
