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
import { findMockRecord, MOCK_ACTIVE_RECORDS, MOCK_RECORDS } from "@/lib/mock/records";
import { findMockUser } from "@/lib/mock/users";
import { regionNamesVisibleTo } from "@/lib/mock/jurisdictions";
import { emitActivityEvent, ensureSeeded as ensureAuditSeeded } from "./audit-store";
import {
  UNIDENTIFIED_MANUFACTURER,
  computeComplianceScore,
  computeComplianceStatus,
  confidenceBand,
  DECLARATION_FIELDS,
  PIPELINE_STAGE_IDS,
  SOURCE_TAGS,
  VIOLATION_CATEGORY_IDS,
  violationCategory,
  type ActivityEventType,
  type AnalyticsSummary,
  type CaptureSlotAngle,
  type CategoryBreakdownEntry,
  type DashboardAlert,
  type DashboardData,
  type CitizenReportDetails,
  type ComplianceRatePoint,
  type ComplianceRecord,
  type ComplianceScore,
  type DeclarationCheck,
  type DeclarationFieldId,
  type ExtractedDeclaration,
  type ManufacturerScorecard,
  type PipelineStage,
  type PipelineStageId,
  type RecordFilters,
  type RecordSort,
  type RecordsPage,
  type RegionBreakdownEntry,
  type ScanMetadata,
  type SourceTag,
  type SourceBreakdownEntry,
  type UploadedImage,
  type Violation,
  type ViolationBreakdownEntry,
} from "@/types";
import { getRuleThresholds, isUserActive } from "./admin-store";

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
  /**
   * Which intake path produced this run. Defaults to `Officer-Scanned`, so
   * page 3's wizard is unaffected — the E-commerce Listing Scanner (page 8)
   * is the first caller to pass anything else, and 08's Definition of Done
   * requires its records be tagged `E-commerce-Sourced`, which was
   * impossible while this was hardcoded in `buildFinalRecord`.
   */
  source?: SourceTag;
  /** Set by page 8's bulk mode, so a batch's records stay traceable to it. */
  batchId?: string;
  /**
   * What the quality-check stage should report. Page 11 passes the outcome of
   * its advisory photo check here, so an officer opening a citizen record can
   * see that the photo looked dark or blurry — information the blocking gate
   * would have thrown away with the photo.
   */
  qualityNote?: string;
  /** What the citizen actually reported (page 11). Never set by the other two paths. */
  citizenReport?: CitizenReportDetails;
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
  source: SourceTag;
  batchId?: string;
  citizenReport?: CitizenReportDetails;
  /** Stage events that fired before the record existed. Flushed once it does. */
  pendingStageEvents?: Array<{ stageId: PipelineStageId; outcome: "completed" | "failed" }>;
  createdAt: string;
  /** Populated once `readyForVerification` completes. */
  record?: ComplianceRecord;
}

const runs = new Map<string, StoredPipelineRun>();

/**
 * Test-only seam, mirroring `resetAuditStoreForTests` in audit-store.ts.
 * Without it, every test in a suite that creates a pipeline run would need
 * a globally-unique scan id to avoid colliding with every other test's runs
 * in the same module-level `runs` Map.
 */
export function resetPipelineStoreForTests(): void {
  runs.clear();
}

/**
 * The quality gate is a pre-submit, client-side step on page 3
 * (`useCaptureSlots.submitImage` → `checkImageQuality`) that runs against a
 * real `File` and reports blur/skew/curvature/no-text — all faults of field
 * photography. A scraped e-commerce listing image has no `File` and none of
 * those failure modes, so no gate ran for it. Rather than claim one did,
 * that run marks the stage `skipped` with its own reason — the same honest
 * treatment `fallbackExtraction` already gets when it isn't needed.
 */
function initialStages(source: SourceTag, qualityNote?: string): PipelineStage[] {
  return PIPELINE_STAGE_IDS.map((id) => {
    if (id !== "qualityCheck") return { id, state: "pending" as const };

    /*
     * Three intake paths, three genuinely different answers — this was a
     * binary check until page 11, and a citizen run fell into the officer
     * branch and claimed a gate had passed when none had run.
     */
    if (source === "E-commerce-Sourced") {
      return {
        id,
        state: "skipped" as const,
        summary: "Not applicable — listing images are not field photographs.",
      };
    }

    if (source === "Citizen-Reported") {
      return {
        id,
        state: "skipped" as const,
        summary:
          qualityNote ??
          "Submitted from the public portal — photo accepted without a blocking quality gate.",
      };
    }

    return {
      id,
      state: "completed" as const,
      summary: "All images passed the quality gate before this screen.",
    };
  });
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
   * The seeded-manufacturer fallback is wrong for a citizen report: an
   * anonymous complaint that names no company would be filed against a real
   * one, which is a false accusation the record then carries into the
   * Manufacturer Scorecard. Citizen submissions get an explicit placeholder
   * instead.
   */
  const manufacturerName =
    metadata.manufacturerName ??
    (run.source === "Citizen-Reported"
      ? UNIDENTIFIED_MANUFACTURER
      : (MOCK_MANUFACTURERS[0]?.name ?? "Unregistered manufacturer"));
  /*
   * `metadata.productName` is set when the intake path actually knows the
   * product's name — today that means the E-commerce Listing Scanner (page
   * 8), which has the scraped listing's own title.
   *
   * TODO (still open for page 3): the Scan Capture Wizard's metadata form
   * (03-scan-upload.md §2 Step 4) has no product-name field, so a
   * physically scanned record still falls back to this synthesized name.
   * Adding that field to the wizard would close the gap for both paths.
   */
  const productName = metadata.productName ?? `${manufacturerName} — ${metadata.category}`;

  const record: ComplianceRecord = {
    id: run.recordId,
    scanId: `LMCS-${new Date().getFullYear()}-${run.scanId.replace(/[^0-9]/g, "").slice(-6).padStart(6, "0")}`,
    productName,
    manufacturerName,
    category: metadata.category,
    region: metadata.region,
    source: run.source,
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
    /*
     * Populated by the projection below, not written here. Every audit event
     * in the product now originates in `audit-store.ts`; this field is the
     * coarse view of that log which page 6, the PDF renderer and the citizen
     * status lookup read.
     */
    auditTrail: [],
    thumbnail,
    capturedImages,
    scannedAt: run.createdAt,
    lastUpdatedAt: now,
    archived: false,
  };

  if (metadata.ecommerceListingUrl !== undefined) {
    record.ecommerceListingUrl = metadata.ecommerceListingUrl;
  }
  /*
   * The officer this case belongs to, for jurisdiction scoping (13 §4.2)
   * and case reassignment. Citizen-Reported records have no officer to
   * assign — `scannedByUserId` there is the `CITIZEN_ACTOR_ID` sentinel,
   * not a real account, so it stays unset rather than assigning a case to
   * an actor that isn't an Enforcement Officer.
   */
  if (run.source !== "Citizen-Reported") {
    record.assignedOfficerUserId = scannedByUserId;
  }
  if (run.batchId !== undefined) {
    record.batchId = run.batchId;
  }
  if (run.citizenReport !== undefined) {
    record.citizenReport = run.citizenReport;
  }

  /*
   * The two events every intake path produces. `scan_created` carries the
   * actor — an officer, or the citizen sentinel for a public submission —
   * while extraction is machine work and deliberately has none, which is
   * exactly what `ActivityEvent.actorUserId` being optional is for.
   */
  emitActivityEvent(
    {
      recordId: record.id,
      type: "scan_created",
      actorUserId: scannedByUserId,
      at: run.createdAt,
      region: record.region,
      detail: `Scanned via ${run.source}.`,
    },
    record
  );

  /*
   * Extraction is NOT logged here. The `textExtraction` stage emits
   * `ocr_completed` itself, and emitting it in both places put two "Extracted"
   * rows on page 6's timeline. The stage is the honest owner of that event —
   * it is the thing that actually ran.
   */

  return record;
}

/**
 * Which stages produce an activity event, and of what kind.
 *
 * Only the stages that mean something to a person reviewing what happened.
 * `uploading` and `readyForVerification` are bookkeeping, and the record's own
 * creation is already logged as `scan_created`, so neither adds anything a
 * reader would act on.
 *
 * All of these are system work with no actor, which is what
 * `ActivityEvent.actorUserId` being optional exists for. None maps onto a
 * coarse `AuditEventType`, so none appears on page 6's timeline — they are
 * there for the Activity Log.
 */
const STAGE_EVENT: Partial<Record<PipelineStageId, ActivityEventType>> = {
  qualityCheck: "image_quality_passed",
  textExtraction: "ocr_completed",
  fallbackExtraction: "ocr_fallback_used",
  structuring: "llm_structuring_completed",
  ruleEngine: "rule_engine_completed",
};

/**
 * Logs one stage transition, but only once the run has a record to hang it
 * on. Stages run before `buildFinalRecord`, so the earlier ones are emitted
 * retrospectively by `emitBackloggedStageEvents` rather than dropped.
 */
function emitStageEvent(
  run: StoredPipelineRun,
  stageId: PipelineStageId,
  outcome: "completed" | "failed"
): void {
  const type = outcome === "failed" ? "image_quality_failed" : STAGE_EVENT[stageId];
  if (!type) return;

  if (!run.record) {
    run.pendingStageEvents = [...(run.pendingStageEvents ?? []), { stageId, outcome }];
    return;
  }

  /* The record is passed so its coarse projection refreshes — `ocr_completed`
   * is the event page 6 renders as "Extracted", and without this the row was
   * logged centrally but never reached the record. */
  emitActivityEvent(
    {
      recordId: run.record.id,
      type,
      region: run.record.region,
      detail:
        outcome === "failed"
          ? (FAILURE_REASON[stageId] ?? `Stage ${stageId} failed.`)
          : stageSummary(run, stageId),
    },
    run.record
  );
}

/** Flushes the stage events that happened before the record existed. */
function emitBackloggedStageEvents(run: StoredPipelineRun): void {
  const pending = run.pendingStageEvents ?? [];
  delete run.pendingStageEvents;
  for (const entry of pending) emitStageEvent(run, entry.stageId, entry.outcome);
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
      emitStageEvent(run, stage.id, "failed");
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
        emitBackloggedStageEvents(run);
      }
      emitStageEvent(run, stage.id, "completed");
    }
    progressed = true;
  }

  return run;
}

function toPublicRun(run: StoredPipelineRun): { scanId: string; recordId: string; stages: PipelineStage[] } {
  return { scanId: run.scanId, recordId: run.recordId, stages: run.stages };
}

export function createPipelineRun(input: CreatePipelineRunInput) {
  const fallbackNeeded = input.fallbackOverride === "skipped"
    ? false
    : input.fallbackOverride === "used" || 68 < getRuleThresholds().ocrConfidenceThreshold;
  const seeded = seedDeclarations(fallbackNeeded, input.forceZeroDeclarations ?? false);
  const now = new Date().toISOString();

  const source: SourceTag = input.source ?? "Officer-Scanned";

  const run: StoredPipelineRun = {
    scanId: input.scanId,
    recordId: `rec-${input.scanId}`,
    stages: initialStages(source, input.qualityNote),
    currentStageStartedAt: now,
    metadata: input.metadata,
    images: input.images,
    scannedByUserId: input.scannedByUserId,
    source,
    ...(input.batchId ? { batchId: input.batchId } : {}),
    ...(input.citizenReport ? { citizenReport: input.citizenReport } : {}),
    createdAt: now,
    seeded,
  };

  if (input.forceFailStage && FORCEABLE_STAGES.includes(input.forceFailStage)) {
    run.forceFailStage = input.forceFailStage;
  }

  runs.set(run.scanId, run);
  return toPublicRun(withAdvancedStages(run));
}

/**
 * Runs a pipeline to completion immediately, for an intake path with no
 * tracker page behind it (page 11).
 *
 * `withAdvancedStages` derives progress from wall-clock time, and the clock
 * for a stage only starts the first time that stage is read. That works
 * because every path so far lands the submitter on a tracker that polls. A
 * citizen submits and leaves with a reference, so nothing ever polls their
 * run — it would sit at its first stage indefinitely and the record would
 * never reach Compliance Records, which page 11 Definition of Done requires.
 *
 * The precedent is `createZeroDeclarationDemoRecord`, which builds a fully
 * completed run for the same underlying reason: a synchronous request cannot
 * wait out simulated stage durations. Nothing about the pipeline is skipped —
 * the same seeding and the same `buildFinalRecord` run, just without the
 * artificial delay a citizen would never see anyway.
 */
export function completePipelineRunNow(scanId: string): ComplianceRecord | undefined {
  const run = runs.get(scanId);
  if (!run) return undefined;

  /*
   * FIXED: this used to rebuild `run.record` unconditionally, so a second call
   * replaced an existing record and silently discarded everything that had
   * happened to it. Harmless while the record carried its own audit array and
   * nothing called this twice; not harmless now that the record is a
   * projection of a log that would keep the orphaned events.
   */
  if (run.record) return run.record;

  const forced: PipelineStageId[] = [];
  for (const stage of run.stages) {
    if (stage.state === "pending" || stage.state === "in_progress") {
      if (stage.id === "fallbackExtraction" && !run.seeded.fallbackNeeded) {
        stage.state = "skipped";
        stage.summary = "Not needed — all fields extracted with high confidence.";
        continue;
      }
      stage.state = "completed";
      stage.summary = stageSummary(run, stage.id);
      forced.push(stage.id);
    }
  }

  run.record = buildFinalRecord(run);
  /* The stages really did resolve, just all at once — so they log, exactly as
   * they would have if something had polled them one at a time. */
  emitBackloggedStageEvents(run);
  for (const stageId of forced) emitStageEvent(run, stageId, "completed");
  return run.record;
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
  /* Same reason as `getAllActiveRecords`: a seed reached directly by id must
   * have its backfilled history in place before anything reads it. */
  ensureAuditSeeded();
  return getCreatedRecord(id) ?? findMockRecord(id);
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

  /* Captured before the write — the old value is the whole point of a
   * correction log, and nothing recorded it until now. */
  const previousValue = declaration.value ?? "";

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

  emitActivityEvent(
    {
      recordId: record.id,
      type: "field_corrected",
      actorUserId: userId,
      fieldId,
      oldValue: previousValue,
      newValue: value,
      region: record.region,
      detail: `Corrected ${fieldId}`,
    },
    record
  );

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
  const computedScore = computeComplianceScore(record);
  const thresholds = getRuleThresholds();
  const band: ComplianceScore["band"] = computedScore.value >= thresholds.excellentMinimum
    ? "Excellent"
    : computedScore.value >= thresholds.goodMinimum
      ? "Good"
      : computedScore.value >= thresholds.poorMinimum
        ? "Poor"
        : "Critical";
  // The score and band are a verified-time fact. Threshold edits affect only later verification.
  record.complianceScore = { ...computedScore, band };
  record.lastUpdatedAt = now;

  emitActivityEvent(
    {
      recordId: record.id,
      type: "confirm_and_verify",
      actorUserId: userId,
      at: now,
      region: record.region,
    },
    record
  );

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

  /*
   * Both directions are logged now. Clearing a flag used to write nothing,
   * because the coarse vocabulary had no word for it — so an accountability
   * trail recorded a flag going up and never coming down. `needs_review_cleared`
   * exists for exactly that, and maps to no coarse type, so page 6's timeline
   * is unchanged while the central log is complete.
   */
  emitActivityEvent(
    {
      recordId: record.id,
      type: flag ? "flagged_needs_review" : "needs_review_cleared",
      actorUserId: userId,
      at: record.lastUpdatedAt,
      region: record.region,
      ...(flag && note ? { detail: note } : {}),
    },
    record
  );

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

  emitActivityEvent(
    {
      recordId: record.id,
      type: "flagged_for_enforcement",
      actorUserId: userId,
      at: record.lastUpdatedAt,
      region: record.region,
    },
    record
  );

  return record;
}

/**
 * Retry OCR (04's "OCR failed entirely" edge case). Re-seeds this record's
 * declarations as a fresh, successful extraction — the same mock
 * simplification the pipeline's own stage-scoped retry already makes
 * (§5 of the plan): a retry always succeeds, since nothing here models a
 * second real OCR attempt.
 */
export function retryExtractionForRecord(
  recordId: string,
  userId: string
): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;

  const correctedBefore = run.record.extraction.declarations.filter((d) => d.corrected).length;
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

  /*
   * This replaces every declaration, so any correction an officer had already
   * made is gone. That was happening silently — no event, and no `userId` on
   * the signature to attribute it to. The count of discarded corrections goes
   * in the detail because it is the part someone would later need to explain.
   */
  emitActivityEvent(
    {
      recordId: record.id,
      type: "ocr_retried",
      actorUserId: userId,
      at: record.lastUpdatedAt,
      region: record.region,
      detail:
        correctedBefore > 0
          ? `Re-extraction discarded ${correctedBefore} earlier correction(s).`
          : "Re-extraction requested.",
    },
    record
  );

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
    source: "Officer-Scanned",
    createdAt: now,
    seeded: seedDeclarations(false, true),
  };
  run.record = buildFinalRecord(run);
  for (const stage of run.stages) emitStageEvent(run, stage.id, "completed");
  runs.set(run.scanId, run);
  return run.record;
}

/*
 * Compliance Records (page 5) reads and mutates the whole record set
 * through the functions below.
 */

/** Every record a pipeline run has produced so far — the list equivalent of `getCreatedRecord`. */
/**
 * Every record the live pipeline has produced.
 *
 * Advances each run first. Progress in this store is derived from elapsed time
 * on read, so a run nobody reads never moves — and until page 11 every run had
 * a tracker page polling it, which hid that. A citizen submission has no
 * tracker at all: the reporter gets a reference and leaves. Without this the
 * run would sit at its first stage forever and the record would never reach
 * Compliance Records, which page 11 Definition of Done explicitly requires.
 *
 * It also fixes the same latent case for the other paths — an officer who
 * closes the tab mid-pipeline had a run that only resumed if they came back.
 */
function getAllCreatedRecords(): ComplianceRecord[] {
  const out: ComplianceRecord[] = [];
  for (const run of runs.values()) {
    withAdvancedStages(run);
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
  if (
    filters.violationCategoryIds.length > 0 &&
    !record.violations.some((v) => filters.violationCategoryIds.includes(v.categoryId))
  )
    return false;
  if (
    filters.batchIds.length > 0 &&
    !(record.batchId !== undefined && filters.batchIds.includes(record.batchId))
  )
    return false;
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
/**
 * Every non-archived record that exists right now, live pipeline-created
 * plus static seeds, deduplicated by id — the one merge both `listRecords`
 * and the Analytics aggregator (07) build on, so a record created through
 * the live pipeline is visible to both rather than only to page 5.
 */
function getAllActiveRecords(): ComplianceRecord[] {
  /* Backfills the static seeds' history on first read — see `audit-store.ts`.
   * Without it a seeded record renders an empty timeline, which reads as
   * broken rather than as fixture data. */
  ensureAuditSeeded();
  const seen = new Set<string>();
  return [...getAllCreatedRecords(), ...MOCK_ACTIVE_RECORDS].filter((record) => {
    if (record.archived || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function dashboardKpis(records: readonly ComplianceRecord[]) {
  const count = (status: ComplianceRecord["complianceStatus"]) =>
    records.filter((record) => record.complianceStatus === status).length;

  /* There is no prior-period dataset in this MVP. A neutral delta is honest;
   * reusing the fixture's illustrative percentages here would make a scoped
   * dashboard look live while still reporting nationwide historical claims. */
  return [
    { id: "productsScanned", value: records.length, deltaPercentage: 0 },
    {
      id: "compliant",
      value: count("Compliant"),
      percentageOfTotal: records.length === 0 ? 0 : Math.round((count("Compliant") / records.length) * 100),
      deltaPercentage: 0,
      routesToStatus: "Compliant",
    },
    {
      id: "nonCompliant",
      value: count("Non-Compliant"),
      percentageOfTotal:
        records.length === 0 ? 0 : Math.round((count("Non-Compliant") / records.length) * 100),
      deltaPercentage: 0,
      routesToStatus: "Non-Compliant",
    },
    {
      id: "pending",
      value: count("Pending"),
      percentageOfTotal: records.length === 0 ? 0 : Math.round((count("Pending") / records.length) * 100),
      deltaPercentage: 0,
      routesToStatus: "Pending",
    },
  ] as DashboardData["kpis"];
}

function bucketDate(iso: string, period: "weekly" | "monthly"): string {
  const date = new Date(iso);
  if (period === "monthly") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function dashboardTrend(records: readonly ComplianceRecord[], period: "weekly" | "monthly") {
  const buckets = new Map<string, { compliant: number; nonCompliant: number; totalScans: number }>();
  for (const record of records) {
    const date = bucketDate(record.scannedAt, period);
    const bucket = buckets.get(date) ?? { compliant: 0, nonCompliant: 0, totalScans: 0 };
    bucket.totalScans += 1;
    if (record.complianceStatus === "Compliant") bucket.compliant += 1;
    if (record.complianceStatus === "Non-Compliant") bucket.nonCompliant += 1;
    buckets.set(date, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, ...values }));
}

function dashboardAlerts(records: readonly ComplianceRecord[]): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const now = Date.now();
  for (const manufacturer of MOCK_MANUFACTURERS) {
    const recentNonCompliant = records.filter(
      (record) =>
        record.manufacturerName === manufacturer.name &&
        record.complianceStatus === "Non-Compliant" &&
        withinThresholdWindow(record.lastUpdatedAt, now)
    );
    const thresholds = getRuleThresholds();
    if (recentNonCompliant.length >= thresholds.repeatViolationCount) {
      alerts.push({
        id: `repeat-violation-${manufacturer.id}`,
        severity: "error",
        message: `${manufacturer.name} has crossed the repeat-violation threshold with ${recentNonCompliant.length} Non-Compliant records in ${thresholds.repeatViolationDays} days.`,
        href: `/manufacturers/${manufacturer.id}`,
      });
    }
  }
  return alerts;
}

/**
 * Dashboard's live read model. It scopes the merged record set once before
 * every widget is derived, so KPIs, trend, recents, alerts and the roll-up
 * all describe the exact same viewer-visible population.
 */
export function computeDashboardData(viewerId?: string): DashboardData {
  const records = scopeRecordsForViewer(getAllActiveRecords(), viewerId);
  const viewer = viewerId ? findMockUser(viewerId) : undefined;
  const canSeeRegionalDistribution =
    viewer?.jurisdictionId === "jur-national" &&
    (viewer.role === "Admin" || viewer.role === "Reviewer");
  const regionalDistribution = canSeeRegionalDistribution
    ? computeRegionBreakdown(records).sort((left, right) => {
        const leftRate = left.totalScanned === 0 ? 0 : left.nonCompliant / left.totalScanned;
        const rightRate = right.totalScanned === 0 ? 0 : right.nonCompliant / right.totalScanned;
        return rightRate - leftRate || left.region.localeCompare(right.region);
      })
    : [];

  return {
    kpis: dashboardKpis(records),
    trends: {
      weekly: dashboardTrend(records, "weekly"),
      monthly: dashboardTrend(records, "monthly"),
    },
    recentScans: records
      .slice()
      .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime())
      .slice(0, 8),
    alerts: dashboardAlerts(records),
    regionalDistribution,
  };
}

/**
 * Narrows a record set to what one viewer's jurisdiction and role permit
 * (13 §4.2) — the ONE place this rule is implemented. `listRecords`,
 * `computeAnalyticsSummary` and `recordsForManufacturer` each call this
 * immediately after `getAllActiveRecords()`, rather than each carrying its
 * own copy of the rule. That matters here specifically: this is exactly the
 * shape of bug that made a manufacturer scanned live invisible on their own
 * scorecard before `getAllActiveRecords()` itself existed (see that
 * function's own doc comment) — one shared choke point instead of three
 * near-identical filters that could quietly drift apart.
 *
 * Two independent narrowings, applied in order:
 *
 * 1. Jurisdiction. A National viewer (or one whose jurisdiction cannot be
 *    resolved) sees everything — `regionNamesVisibleTo` returns `null` for
 *    both cases, meaning "do not filter by region at all," which is a
 *    deliberate fail-open: every account this build ships resolves to a
 *    real jurisdiction, so the unresolvable branch never actually fires
 *    today, but a caller that forgets to pass a viewer during rollout sees
 *    too much rather than a silently blank page. A `State` viewer sees only
 *    records whose region equals their state's name.
 * 2. Role. An Enforcement Officer sees only their own assigned cases
 *    (`assignedOfficerUserId === viewer.id`) — REGARDLESS of jurisdiction
 *    level, per 13 §4.2's own wording, so this filter applies even to an
 *    Officer at National jurisdiction. This is a genuine, intended
 *    narrowing of what the existing `usr-001` account sees (12 seed records
 *    down to the 7 it scanned), not a regression — see the 13 §4 plan's own
 *    "EO own-cases rule" decision. Admin and Reviewer are unaffected;
 *    §4.2 states no jurisdiction rule for Reviewer at all, so it stays
 *    unscoped rather than inventing a rule nothing asked for.
 */
export function scopeRecordsForViewer(
  records: ComplianceRecord[],
  viewerId: string | undefined
): ComplianceRecord[] {
  const viewer = viewerId ? findMockUser(viewerId) : undefined;
  if (!viewer) return records;

  let scoped = records;

  const visibleRegions = regionNamesVisibleTo(viewer.jurisdictionId);
  if (visibleRegions !== null) {
    const regionSet = new Set(visibleRegions);
    scoped = scoped.filter((record) => regionSet.has(record.region));
  }

  if (viewer.role === "Enforcement Officer") {
    scoped = scoped.filter((record) => record.assignedOfficerUserId === viewer.id);
  }

  return scoped;
}

/**
 * Every record's human-readable scan id, keyed by record id — live
 * pipeline-created plus every static seed.
 *
 * The Global Activity Log (13 §3.2) stores a record id on each event but a
 * person recognises the scan id, and the log deliberately keeps an archived
 * record's events, so this includes archived records where
 * `getAllActiveRecords` excludes them. Live records must be in here too: a
 * label map built from the seeds alone renders a raw `rec-…` id for exactly
 * the records someone created in this session.
 */
export function recordScanIdLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const record of MOCK_RECORDS) labels[record.id] = record.scanId;
  /* Live records last, so a live record that shadows a seed id wins — the
   * same precedence `getAllActiveRecords` uses. */
  for (const record of getAllCreatedRecords()) labels[record.id] = record.scanId;
  return labels;
}

export function listRecords(
  filters: RecordFilters,
  sort: RecordSort,
  page: number,
  pageSize: number,
  viewerId?: string
): RecordsPage {
  const all = scopeRecordsForViewer(getAllActiveRecords(), viewerId);
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

export interface AnalyticsAggregate {
  summary: AnalyticsSummary;
  violationBreakdown: ViolationBreakdownEntry[];
  categoryBreakdown: CategoryBreakdownEntry[];
  regionBreakdown: RegionBreakdownEntry[];
  sourceBreakdown: SourceBreakdownEntry[];
}

function computeRegionBreakdown(records: readonly ComplianceRecord[]): RegionBreakdownEntry[] {
  return Object.values(
    records.reduce<Record<string, RegionBreakdownEntry>>((acc, record) => {
      const entry = acc[record.region] ?? {
        region: record.region,
        totalScanned: 0,
        nonCompliant: 0,
      };
      entry.totalScanned += 1;
      if (record.complianceStatus === "Non-Compliant") entry.nonCompliant += 1;
      acc[record.region] = entry;
      return acc;
    }, {})
  );
}

/**
 * Summary/violation/category/region/source breakdowns for Analytics &
 * Violation Trends (page 7), computed live over `getAllActiveRecords()` —
 * the same live+static merge `listRecords()` uses, so a record created
 * through the live pipeline shows up here too. This fixes the same class of
 * bug page 5's `fetchRecords()` had before its own fix:
 * `src/lib/mock/analytics.ts`'s `MOCK_*_BREAKDOWN` constants are computed
 * once, at module load, from the static seeds only.
 *
 * Trend and anomalies are deliberately NOT computed here — they stay the
 * illustrative static mock data `analytics.ts` already documents ("twelve
 * seed records cannot describe several months of activity"); a live trend
 * from today's tiny record count would be a worse chart, not a more honest
 * one.
 */
export function computeAnalyticsSummary(viewerId?: string): AnalyticsAggregate {
  const all = scopeRecordsForViewer(getAllActiveRecords(), viewerId);
  const total = all.length;

  const compliantCount = all.filter((r) => r.complianceStatus === "Compliant").length;
  const nonCompliantCount = all.filter((r) => r.complianceStatus === "Non-Compliant").length;
  const completedCount = all.filter((r) => r.extraction.processingStatus === "Completed").length;

  const summary: AnalyticsSummary = {
    totalScanned: total,
    complianceRatePercentage:
      compliantCount + nonCompliantCount === 0
        ? 0
        : Math.round((compliantCount / (compliantCount + nonCompliantCount)) * 100),
    processingSuccessRatePercentage: total === 0 ? 0 : Math.round((completedCount / total) * 100),
  };

  const violationBreakdown: ViolationBreakdownEntry[] = VIOLATION_CATEGORY_IDS.map(
    (categoryId) => ({
      categoryId,
      count: all.reduce(
        (sum, record) => sum + record.violations.filter((v) => v.categoryId === categoryId).length,
        0
      ),
    })
  );

  const categoryBreakdown: CategoryBreakdownEntry[] = Object.values(
    all.reduce<Record<string, CategoryBreakdownEntry>>((acc, record) => {
      const entry = acc[record.category] ?? {
        category: record.category,
        compliant: 0,
        nonCompliant: 0,
      };
      if (record.complianceStatus === "Compliant") entry.compliant += 1;
      if (record.complianceStatus === "Non-Compliant") entry.nonCompliant += 1;
      acc[record.category] = entry;
      return acc;
    }, {})
  );

  const regionBreakdown = computeRegionBreakdown(all);

  const sourceBreakdown: SourceBreakdownEntry[] = SOURCE_TAGS.map((source) => ({
    source,
    count: all.filter((r) => r.source === source).length,
  }));

  return { summary, violationBreakdown, categoryBreakdown, regionBreakdown, sourceBreakdown };
}

/**
 * Records a `"Report Generated"` audit event against every record a report
 * covered (page 10, and 13 §3.1's "Report generated / exported / downloaded,
 * and by whom" on the per-record timeline).
 *
 * `"Report Generated"` has been in the fixed `AuditEventType` vocabulary and
 * translated in both catalogues since the type was written, with no consumer
 * until now — page 10 is its first.
 *
 * Deliberately no event on re-download. 13 proposes a separate
 * `report_downloaded` type, but the shipped vocabulary has no such literal
 * and inventing one here is exactly the drift this codebase avoids
 * everywhere else (see `bulkSetNeedsReview` making the same call for the
 * un-flag direction).
 *
 * Same accepted limitation as every other mutation in this file: a
 * static-seed record has no backing run to write to, and comes back in
 * `skipped` rather than failing silently.
 */
export function recordReportGenerated(
  recordIds: readonly string[],
  userId: string,
  reportName: string
): { updated: string[]; skipped: string[] } {
  const updated: string[] = [];
  const skipped: string[] = [];
  const at = new Date().toISOString();

  for (const recordId of recordIds) {
    const run = findRunByRecordId(recordId);
    if (!run?.record) {
      skipped.push(recordId);
      continue;
    }
    const record = run.record;
    emitActivityEvent(
      {
        recordId: record.id,
        type: "report_generated",
        actorUserId: userId,
        at,
        region: record.region,
        detail: reportName,
      },
      record
    );
    record.lastUpdatedAt = at;
    updated.push(recordId);
  }

  return { updated, skipped };
}

/*
 * ---------------------------------------------------------------------------
 * Manufacturer Compliance Scorecard (page 9)
 * ---------------------------------------------------------------------------
 * Same live+static merge as `listRecords` and `computeAnalyticsSummary`, for
 * the same reason: `src/lib/mock/manufacturers.ts`'s `MOCK_SCORECARDS` is
 * computed once at module load from the static seeds only, so a manufacturer
 * scanned through the live pipeline today would never appear on their own
 * scorecard. That's the third time this bug class has come up (pages 5, 7,
 * now 9); the aggregation maths itself is lifted from that module's
 * `buildScorecard` rather than written twice.
 *
 * Unlike the mock, the threshold window is anchored to real `Date.now()`.
 * The mock keeps its fixed `REFERENCE_NOW` so seeded demo flags stay stable
 * however long from now the demo runs; live scans have to age correctly.
 */

/** Records whose manufacturer matches, on the exact-name join `RecordFilters.manufacturers` also uses. */
/**
 * `viewerId` is optional and only ever passed by the Manufacturer
 * Compliance Scorecard's own read path (13 §4 plan). `flagManufacturerForEnforcement`
 * below deliberately calls this the same way it always has, with no
 * viewer — flagging is a mutation over the manufacturer's real, complete
 * set of qualifying records, not a scoped read, and narrowing what an
 * enforcement action can see would change what gets flagged, not just what
 * gets displayed. That's a bigger decision than this session's scope
 * (visibility on Dashboard/Records/Analytics/Scorecard), so it's left alone.
 */
function recordsForManufacturer(name: string, viewerId?: string): ComplianceRecord[] {
  const all = getAllActiveRecords().filter((record) => record.manufacturerName === name);
  return scopeRecordsForViewer(all, viewerId);
}

function withinThresholdWindow(iso: string, now: number): boolean {
  const days = (now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  return days <= getRuleThresholds().repeatViolationDays;
}

/**
 * The Non-Compliant records that a manufacturer-level enforcement flag would
 * cover: Non-Compliant, inside the threshold window. Shared by the scorecard
 * aggregation and `flagManufacturerForEnforcement`, so the count shown in the
 * confirmation is computed by the same code that does the flagging.
 */
function recentNonCompliantRecords(
  name: string,
  now: number,
  viewerId?: string
): ComplianceRecord[] {
  return recordsForManufacturer(name, viewerId).filter(
    (record) =>
      record.complianceStatus === "Non-Compliant" &&
      withinThresholdWindow(record.lastUpdatedAt, now)
  );
}

/**
 * `viewerId` scopes every number on the scorecard — compliance rate, trend,
 * violation breakdown, the repeat-violation flag — to what that viewer can
 * see, not just the product list (13 §4 plan). Worth being direct about the
 * consequence: a State Admin's scorecard for a national manufacturer shows
 * that manufacturer's record *within their state*, which can genuinely
 * disagree with the manufacturer's true national standing (repeat-violation
 * flagged in one view, clean in another). That's the correct behaviour for
 * a jurisdiction-scoped read, not a bug, but it's why the scorecard needs
 * to be legible about being a scoped view rather than the complete picture.
 */
function buildScorecard(
  id: string,
  name: string,
  now: number,
  viewerId?: string
): ManufacturerScorecard {
  const products = recordsForManufacturer(name, viewerId);
  const verified = products.filter((r) => r.verificationStatus === "Verified");
  const compliant = verified.filter((r) => r.complianceStatus === "Compliant");
  const recentNonCompliantCount = recentNonCompliantRecords(name, now, viewerId).length;

  const violationBreakdown: ViolationBreakdownEntry[] = VIOLATION_CATEGORY_IDS.map(
    (categoryId) => ({
      categoryId,
      count: products.reduce(
        (sum, record) => sum + record.violations.filter((v) => v.categoryId === categoryId).length,
        0
      ),
    })
  ).filter((entry) => entry.count > 0);

  const dates = products
    .map((r) => r.scannedAt)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  /*
   * One cumulative point per Verified record, oldest first — deliberately not
   * the illustrative `MOCK_TREND` (07's precedent: real-but-thin beats
   * fabricated-but-smooth). Each point carries its `sampleSize` so a
   * manufacturer with a single scan renders one point the UI can label as too
   * thin for a trend, rather than a flat line implying stability.
   */
  const complianceTrend: ComplianceRatePoint[] = verified
    .slice()
    .sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime())
    .map((record, index, all) => {
      const upTo = all.slice(0, index + 1);
      const compliantSoFar = upTo.filter((r) => r.complianceStatus === "Compliant").length;
      return {
        date: record.scannedAt.slice(0, 10),
        ratePercentage: Math.round((compliantSoFar / upTo.length) * 100),
        sampleSize: upTo.length,
      };
    });

  return {
    summary: {
      id,
      name,
      totalProductsScanned: products.length,
      complianceRatePercentage:
        verified.length === 0 ? 0 : Math.round((compliant.length / verified.length) * 100),
      firstScannedAt: dates[0] ?? "",
      lastScannedAt: dates[dates.length - 1] ?? "",
    },
    repeatViolationFlagged:
      recentNonCompliantCount >= getRuleThresholds().repeatViolationCount,
    recentNonCompliantCount,
    repeatViolationThreshold: {
      nonCompliantCount: getRuleThresholds().repeatViolationCount,
      withinDays: getRuleThresholds().repeatViolationDays,
    },
    complianceTrend,
    violationBreakdown,
    products,
  };
}

export function computeManufacturerScorecards(viewerId?: string): ManufacturerScorecard[] {
  const now = Date.now();
  return MOCK_MANUFACTURERS.map((m) => buildScorecard(m.id, m.name, now, viewerId));
}

export function computeManufacturerScorecard(
  id: string,
  viewerId?: string
): ManufacturerScorecard | undefined {
  const manufacturer = MOCK_MANUFACTURERS.find((m) => m.id === id);
  if (!manufacturer) return undefined;
  return buildScorecard(manufacturer.id, manufacturer.name, Date.now(), viewerId);
}

/**
 * Resolves a directory manufacturer at the direct-detail boundary. A known
 * manufacturer with records that are all outside the viewer's scope is
 * deliberately distinct from one that has never had a record anywhere.
 */
export function resolveManufacturerScorecardForViewer(
  id: string,
  viewerId?: string
): { scorecard?: ManufacturerScorecard; blocked: boolean } {
  const manufacturer = MOCK_MANUFACTURERS.find((candidate) => candidate.id === id);
  if (!manufacturer) return { blocked: false };

  const global = recordsForManufacturer(manufacturer.name);
  const visible = scopeRecordsForViewer(global, viewerId);
  if (global.length > 0 && visible.length === 0) return { blocked: true };

  return {
    scorecard: buildScorecard(manufacturer.id, manufacturer.name, Date.now(), viewerId),
    blocked: false,
  };
}

export interface ManufacturerFlagResult {
  flagged: ComplianceRecord[];
  /** Ids that couldn't be written to — static-seed records with no backing run. */
  skipped: string[];
  /** Already flagged before this call, so not counted as newly actioned. */
  alreadyFlagged: string[];
}

/**
 * Flag for Enforcement at manufacturer scope (09 §4) — Enforcement Officer
 * and Admin only, per the Role Permission Matrix.
 *
 * There is no manufacturer-level entity to flag: `flaggedForEnforcement`
 * lives on the record. So this fans out over the manufacturer's qualifying
 * records (Non-Compliant, inside the threshold window) exactly as
 * `bulkSetNeedsReview` fans out over a selection, and the manufacturer's flag
 * state is *derived* from its products rather than stored a second time where
 * the two could disagree.
 *
 * Each affected record gets a real `"Flagged for Enforcement"` audit event
 * noting it came from a manufacturer-level action, so page 6's audit trail
 * tells the true story of why a record an officer never opened is flagged.
 *
 * Same accepted limitation as every other mutation in this file: a
 * static-seed record has no backing run to write to. Those ids come back in
 * `skipped` so the UI can say so, rather than the click silently no-opping.
 */
export function flagManufacturerForEnforcement(
  manufacturerName: string,
  userId: string
): ManufacturerFlagResult {
  const flagged: ComplianceRecord[] = [];
  const skipped: string[] = [];
  const alreadyFlagged: string[] = [];

  for (const candidate of recentNonCompliantRecords(manufacturerName, Date.now())) {
    if (candidate.flaggedForEnforcement) {
      alreadyFlagged.push(candidate.id);
      continue;
    }

    const run = findRunByRecordId(candidate.id);
    if (!run?.record) {
      skipped.push(candidate.id);
      continue;
    }
    const record = run.record;

    record.flaggedForEnforcement = true;
    record.lastUpdatedAt = new Date().toISOString();
    /* Same event type as the single-record flag — the fan-out is many of the
     * same action, not a different one. The detail is what distinguishes it. */
    emitActivityEvent(
      {
        recordId: record.id,
        type: "flagged_for_enforcement",
        actorUserId: userId,
        at: record.lastUpdatedAt,
        region: record.region,
        detail: `Manufacturer-level enforcement action: ${manufacturerName}`,
      },
      record
    );

    flagged.push(record);
  }

  return { flagged, skipped, alreadyFlagged };
}

/**
 * Archive (Admin-only per 00-README.md §C). Same accepted limitation as
 * every other mutation here: a static-seed record has no backing store to
 * write to and this returns `undefined` for one, same as `applyCorrection`.
 */
export function archiveRecord(recordId: string, userId: string): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  run.record.archived = true;
  run.record.lastUpdatedAt = new Date().toISOString();

  /* Archiving is Admin-only and removes a record from every default view, and
   * it logged nothing at all until now. It takes a `userId` for the first time
   * for this reason — an unattributable destructive-ish action is precisely
   * what an audit log exists to prevent. */
  emitActivityEvent(
    {
      recordId: run.record.id,
      type: "record_archived",
      actorUserId: userId,
      at: run.record.lastUpdatedAt,
      region: run.record.region,
    },
    run.record
  );

  return run.record;
}

/**
 * Case reassignment (13 §4.2) — an Admin at or above a case's own
 * jurisdiction moves it to a different Enforcement Officer. Backend logic
 * only: no route handler and no UI call it yet, since the reassignment
 * screen belongs to the unbuilt Admin Console (§4.3), which is where an
 * Admin would actually pick "which case" and "which officer" from a real
 * list. Planned and implemented now anyway, per the 13 §4 plan's own
 * decision, because it's the same jurisdiction-traversal logic this file
 * already has in hand, it closes the previously-never-emitted
 * `case_reassigned` gap (BACKEND_HANDOFF.md §7.5/§8) cheaply, and it's what
 * makes `assignedOfficerUserId` — and therefore "an Officer sees their own
 * cases" — a real, moveable fact rather than a field nothing ever changes.
 *
 * Three ways this can honestly fail, and it returns `undefined` for every
 * one of them rather than distinguishing which — the same coarse
 * "not writable" shape every other single-record mutation here already
 * uses, since nothing consumes a richer reason yet:
 *
 *   - the record doesn't exist or has no backing pipeline run (the same
 *     static-seed limitation every mutation in this file accepts);
 *   - `reassignedByUserId` isn't a real Admin, or their jurisdiction
 *     doesn't cover the record's own region — an Admin cannot reassign a
 *     case outside their scope, mirroring how a State Admin cannot see
 *     records outside it either;
 *   - `newOfficerUserId` isn't a real Enforcement Officer — reassigning a
 *     case to an Admin or a Reviewer would create a case with no one
 *     eligible to actually work it.
 */
export function reassignCase(
  recordId: string,
  newOfficerUserId: string,
  reassignedByUserId: string
): ComplianceRecord | undefined {
  const run = findRunByRecordId(recordId);
  if (!run?.record) return undefined;
  const record = run.record;

  const admin = findMockUser(reassignedByUserId);
  if (!admin || admin.role !== "Admin") return undefined;

  const visibleRegions = regionNamesVisibleTo(admin.jurisdictionId);
  if (visibleRegions !== null && !visibleRegions.includes(record.region)) return undefined;

  const newOfficer = findMockUser(newOfficerUserId);
  if (!newOfficer || newOfficer.role !== "Enforcement Officer" || !isUserActive(newOfficer.id)) return undefined;
  const targetRegions = regionNamesVisibleTo(newOfficer.jurisdictionId);
  if (targetRegions !== null && !targetRegions.includes(record.region)) return undefined;
  if (visibleRegions !== null && !visibleRegions.includes(newOfficer.region)) return undefined;

  const previousOfficerName = record.assignedOfficerUserId
    ? (findMockUser(record.assignedOfficerUserId)?.fullName ?? record.assignedOfficerUserId)
    : "no one";

  record.assignedOfficerUserId = newOfficer.id;
  record.lastUpdatedAt = new Date().toISOString();

  emitActivityEvent(
    {
      recordId: record.id,
      type: "case_reassigned",
      actorUserId: admin.id,
      at: record.lastUpdatedAt,
      region: record.region,
      detail: `Reassigned from ${previousOfficerName} to ${newOfficer.fullName}.`,
    },
    record
  );

  return record;
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

    emitActivityEvent(
      {
        recordId: record.id,
        type: flag ? "flagged_needs_review" : "needs_review_cleared",
        actorUserId: userId,
        at: record.lastUpdatedAt,
        region: record.region,
        detail: "Bulk action",
      },
      record
    );

    updated.push(record);
  }

  return { updated, skipped };
}
