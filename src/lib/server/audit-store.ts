/**
 * audit-store.ts — the central activity log (13-history-and-hierarchy.md §3).
 *
 * ONE WRITE PATH
 * ---------------
 * Before this module there were eight write sites, all inside
 * scan-pipeline-store.ts, each shaping its own event inline and pushing
 * straight onto `record.auditTrail`. Several mutations wrote nothing at all —
 * archiving, Retry OCR, and clearing a Needs Review flag were invisible. Now
 * every mutation calls `emitActivityEvent` and nothing else.
 *
 * WHY `record.auditTrail` STILL EXISTS
 * -------------------------------------
 * It has three readers and only one of them is display:
 *
 *   - `RecordDetailView` renders page 6's timeline
 *   - `report-render.ts` derives the PDF's verifying officer from it, because
 *     the record carries no `verifiedAt` field anywhere else
 *   - `grievance-store.ts` decides a citizen's public "Under Review" label
 *     from the presence of a correction
 *
 * Re-pointing page 6 at a new endpoint would have left those two reading a
 * field nothing maintained. So the field stays, and this store maintains it:
 * `emitActivityEvent` writes the rich event here and refreshes the record's
 * coarse projection in the same call. One source of truth, two views of it,
 * and no consumer had to change.
 *
 * SEED HISTORY IS SYNTHESIZED HERE
 * ---------------------------------
 * Static seed records have no pipeline run behind them, so no mutation can
 * ever write to them. Their history is derived from the fields they do carry
 * (see `synthesizeSeedActivity`) at first read. Without it, browsing an older
 * record would show an empty timeline, which reads as broken rather than as
 * "this is fixture data".
 */

/*
 * Imported from the specific mock modules rather than the `@/lib/mock` barrel,
 * the same way `scan-pipeline-store.ts` does and for the same reason: the
 * barrel re-exports modules that reach back into this layer, and going through
 * it would close a real import cycle.
 */
import { MOCK_RECORDS } from "@/lib/mock/records";
import { findMockUser, mockUserName } from "@/lib/mock/users";
import {
  ACTIVITY_TO_AUDIT_TYPE,
  CITIZEN_ACTOR_ID,
  type ActivityEvent,
  type ActivityEventType,
  type AuditEvent,
  type ComplianceRecord,
  type DeclarationFieldId,
} from "@/types";

/** Every event, newest last. A flat log because the Activity Log queries across records. */
const events: ActivityEvent[] = [];

let sequence = 0;
let seeded = false;

function nextId(): string {
  sequence += 1;
  return `act-${sequence.toString().padStart(6, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export interface EmitActivityInput {
  recordId: string;
  type: ActivityEventType;
  /** Omitted for system-driven pipeline stages and for citizen submissions. */
  actorUserId?: string;
  detail?: string;
  fieldId?: DeclarationFieldId;
  oldValue?: string;
  newValue?: string;
  region?: string;
  /** Defaults to now. Supplied only when backfilling seed history. */
  at?: string;
}

/**
 * The single write path. Records the event and refreshes the record's coarse
 * `auditTrail` projection so page 6, the PDF renderer and the citizen status
 * lookup all see it without any of them changing.
 *
 * `record` is optional because seed backfill emits before it projects, and
 * because a caller that only has an id should not have to find the object.
 */
export function emitActivityEvent(
  input: EmitActivityInput,
  record?: ComplianceRecord
): ActivityEvent {
  const actorRole = input.actorUserId ? findMockUser(input.actorUserId)?.role : undefined;


  const event: ActivityEvent = {
    id: nextId(),
    recordId: input.recordId,
    type: input.type,
    createdAt: input.at ?? new Date().toISOString(),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(actorRole ? { actorRole } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.fieldId ? { fieldId: input.fieldId } : {}),
    ...(input.oldValue !== undefined ? { oldValue: input.oldValue } : {}),
    ...(input.newValue !== undefined ? { newValue: input.newValue } : {}),
    ...(input.region ? { region: input.region } : {}),
  };

  events.push(event);
  if (record) record.auditTrail = projectAuditTrail(input.recordId);
  return event;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * One record's events, oldest first.
 *
 * Order is load-bearing, not cosmetic: `verifierOf()` reverse-finds the last
 * `Verified` event to name the officer on a PDF, and page 6 renders the array
 * as it arrives with no sort of its own. Returning newest-first would silently
 * flip both.
 */
export function activityForRecord(recordId: string): ActivityEvent[] {
  ensureSeeded();
  return events
    .filter((event) => event.recordId === recordId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * The coarse per-record view page 6 renders.
 *
 * Machine-generated events (pipeline stages, quality attempts) map to `null`
 * in `ACTIVITY_TO_AUDIT_TYPE` and are filtered out here, so the tab keeps
 * showing what it shows today rather than filling with stage noise. The
 * Activity Log will read the full log instead.
 */
export function projectAuditTrail(recordId: string): AuditEvent[] {
  const projected: AuditEvent[] = [];

  for (const event of activityForRecord(recordId)) {
    const type = ACTIVITY_TO_AUDIT_TYPE[event.type];
    if (!type) continue;

    projected.push({
      id: event.id,
      type,
      at: event.createdAt,
      ...(event.actorUserId ? { byUserId: event.actorUserId } : {}),
      /*
       * Resolved here rather than at each write site. Live pipeline records
       * used to render with no name at all while seeds always showed one,
       * purely because only the seed builder called `mockUserName`. Doing it
       * in one place ends that split.
       */
      ...(event.actorUserId ? { byUserName: resolveActorName(event.actorUserId) } : {}),
      ...(event.detail ? { note: event.detail } : {}),
    });
  }

  return projected;
}

/**
 * A citizen has no account, so `mockUserName` would call them "System" — the
 * one label that makes a public report read as something the software did to
 * itself.
 */
function resolveActorName(actorUserId: string): string {
  if (actorUserId === CITIZEN_ACTOR_ID) return "Citizen report (public portal)";
  return mockUserName(actorUserId);
}

/* ------------------------------------------------------------------ *
 * Seed backfill
 * ------------------------------------------------------------------ */

/**
 * Spreads a seed's synthesized events between the two timestamps it actually
 * carries.
 *
 * A seed has only `scannedAt` and `lastUpdatedAt`, so its whole post-scan
 * history shared one instant and page 6 rendered three rows with the same
 * calendar date. Spacing them makes the timeline read as a sequence, which is
 * what it is.
 */
function spread(from: string, to: string, index: number, total: number): string {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (total <= 1 || end <= start) return to;
  return new Date(start + ((end - start) * (index + 1)) / total).toISOString();
}

/**
 * A plausible event sequence for one seed record, derived from the fields it
 * already carries. Never invents an actor: every attribution here comes from
 * a real id on the record.
 */
function synthesizeSeedActivity(record: ComplianceRecord): EmitActivityInput[] {
  /*
   * Actors are read off the seed's own pre-built trail, because that is the
   * only place they exist — `ComplianceRecord` has no `scannedByUserId` or
   * `verifiedAt` field. So this reads the fixture's coarse history and
   * re-expresses it as activity, rather than inventing attributions.
   */
  const scannedBy = record.auditTrail[0]?.byUserId;
  const corrected = record.extraction.declarations.filter((d) => d.corrected);

  const later: EmitActivityInput[] = [];

  for (const declaration of corrected) {
    later.push({
      recordId: record.id,
      type: "field_corrected",
      fieldId: declaration.fieldId,
      ...(declaration.correctedByUserId ? { actorUserId: declaration.correctedByUserId } : {}),
      newValue: declaration.value ?? "",
      detail: `Corrected ${declaration.fieldId} against the source image.`,
    });
  }

  if (record.verificationStatus === "Verified") {
    const verifier =
      record.auditTrail.find((event) => event.type === "Verified")?.byUserId ?? scannedBy;
    later.push({
      recordId: record.id,
      type: "confirm_and_verify",
      ...(verifier ? { actorUserId: verifier } : {}),
    });
  }

  if (record.flaggedForEnforcement) {
    const actor =
      record.auditTrail.find((e) => e.type === "Flagged for Enforcement")?.byUserId ?? scannedBy;
    later.push({
      recordId: record.id,
      type: "flagged_for_enforcement",
      ...(actor ? { actorUserId: actor } : {}),
    });
  }

  if (record.needsReviewFlag) {
    later.push({
      recordId: record.id,
      type: "flagged_needs_review",
      ...(record.needsReviewByUserId ? { actorUserId: record.needsReviewByUserId } : {}),
      ...(record.needsReviewNote ? { detail: record.needsReviewNote } : {}),
    });
  }

  return [
    {
      recordId: record.id,
      type: "scan_created",
      ...(scannedBy ? { actorUserId: scannedBy } : {}),
      at: record.scannedAt,
      region: record.region,
    },
    {
      recordId: record.id,
      type: "ocr_completed",
      at: record.scannedAt,
      detail: "Automated extraction completed.",
      region: record.region,
    },
    ...later.map((event, index) => ({
      ...event,
      region: record.region,
      at: spread(record.scannedAt, record.lastUpdatedAt, index, later.length),
    })),
  ];
}

/**
 * Seeds are backfilled on first read, not at module load, matching the lazy
 * pattern `report-store.ts` and `grievance-store.ts` already use.
 */
export function ensureSeeded(): void {
  if (seeded) return;
  /* Set before the loop: `emitActivityEvent` reads nothing here, but
   * `projectAuditTrail` calls `activityForRecord`, which calls back into this
   * function. Without the early flag that recurses forever. */
  seeded = true;

  for (const record of MOCK_RECORDS) {
    for (const input of synthesizeSeedActivity(record)) {
      emitActivityEvent(input);
    }
    record.auditTrail = projectAuditTrail(record.id);
  }
}

/** Test seam: forget everything. Never called by application code. */
export function resetAuditStoreForTests(): void {
  events.length = 0;
  sequence = 0;
  seeded = false;
}
