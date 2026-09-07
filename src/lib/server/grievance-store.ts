/**
 * grievance-store.ts — server-side state for the Citizen Grievance Portal
 * (page 11).
 *
 * THE FIRST DELIBERATELY PUBLIC WRITE PATH
 * -----------------------------------------
 * Every other mutation in this product is reached from a page that required a
 * signed-in user to get there. This one is reached by anyone with the URL.
 *
 * Worth being precise about what that does and does not change. No route
 * handler in this app performs a server-side session or role check today —
 * they take an unvalidated user id in the body, or identify nobody at all.
 * So this endpoint is not bypassing a check; there is no check anywhere to
 * bypass. What it is, is the first endpoint that is *meant* to be open, which
 * makes it the right place to say that out loud rather than let it pass.
 *
 * WHY ITS OWN MODULE AND ITS OWN HANDLER
 * ---------------------------------------
 * `POST /api/scan-pipelines` does not accept `source` and silently drops it,
 * so routing a citizen submission through it would quietly produce an
 * `Officer-Scanned` record. Page 8 hit the same wall and solved it by calling
 * `createPipelineRun` directly from its own server module; this does the same.
 *
 * WHAT IT KEEPS THAT THE RECORD DOES NOT
 * ---------------------------------------
 * Submitter name and contact are optional PII. `ComplianceRecord` is served by
 * the broadly-readable `/api/records`, so those two fields stay here, keyed by
 * reference, and only a boolean travels onto the record.
 */

import { MOCK_GRIEVANCE_LOOKUPS } from "@/lib/mock/grievances";
import { generateGrievanceReference, normalizeShortCode } from "@/lib/utils/shortCode";
import {
  CITIZEN_ACTOR_ID,
  CITIZEN_REGION_SENTINEL,
  type CitizenReportDetails,
  type GrievanceConcern,
  type GrievanceStatusLookup,
  type PublicGrievanceStatus,
} from "@/types";

import {
  completePipelineRunNow,
  createPipelineRun,
  getRecordById,
} from "./scan-pipeline-store";

/* ------------------------------------------------------------------ *
 * Abuse guard
 * ------------------------------------------------------------------ */

/**
 * DEMO-GRADE, AND SAYING SO PLAINLY.
 *
 * This is a counter in a Map. It resets whenever the server restarts, an IP is
 * trivially spoofed with a forged header, and a determined submitter defeats it
 * from a second network in seconds. It is not abuse prevention and must not be
 * described as such.
 *
 * It is here because the alternative was a public endpoint that accepts an
 * image with literally nothing in front of it, and because a visible, honest
 * guard is easier to replace with a real one than an absence nobody noticed.
 * Real protection needs a rate limiter at the edge, a bot check, and the
 * server-side auth this product does not have yet.
 */
const MAX_SUBMISSIONS_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000;

/** Roughly a phone photo at full resolution, with room to spare. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const submissionTimes = new Map<string, number[]>();

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the oldest submission in the window ages out. */
  retryAfterSeconds: number;
}

export function checkRateLimit(clientKey: string): RateLimitVerdict {
  const now = Date.now();
  const recent = (submissionTimes.get(clientKey) ?? []).filter(
    (at) => now - at < WINDOW_MS
  );

  if (recent.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    const oldest = recent[0]!;
    submissionTimes.set(clientKey, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  submissionTimes.set(clientKey, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/* ------------------------------------------------------------------ *
 * Submissions
 * ------------------------------------------------------------------ */

interface StoredGrievance {
  reference: string;
  /** Absent for the seeded demo references, which have no backing record. */
  recordId?: string;
  submittedAt: string;
  /**
   * Only the seeded fixtures carry this. A real submission derives its status
   * from its record, so nothing can pin a live report to a status that stopped
   * being true.
   */
  fixedStatus?: PublicGrievanceStatus;
  /** Kept here and never on the record — see the module doc comment. */
  submitterName?: string;
  submitterContact?: string;
}

const grievances = new Map<string, StoredGrievance>();

let seeded = false;

/**
 * Seeds the three demo references on first read, so a demo can type one in
 * without submitting first and see each of the three public labels.
 */
function ensureSeeded(): void {
  if (seeded) return;
  for (const entry of MOCK_GRIEVANCE_LOOKUPS) {
    grievances.set(entry.reference, {
      reference: entry.reference,
      submittedAt: entry.lastUpdatedAt,
      fixedStatus: entry.status,
    });
  }
  seeded = true;
}

export interface SubmitGrievanceInput {
  photo: { fileName: string; url: string; sizeBytes: number };
  concerns: GrievanceConcern[];
  concernNote?: string;
  shopNameOrLocation?: string;
  submitterName?: string;
  submitterContact?: string;
  /** From the client-side advisory check. Recorded, never used to reject. */
  qualityNote?: string;
}

export interface SubmitGrievanceResult {
  reference: string;
  submittedAt: string;
}

export function submitGrievance(input: SubmitGrievanceInput): SubmitGrievanceResult {
  ensureSeeded();
  let reference = generateGrievanceReference();
  while (grievances.has(reference)) reference = generateGrievanceReference();

  const scanId = `grv-${Date.now()}-${reference.slice(3).toLowerCase()}`;
  const submittedAt = new Date().toISOString();

  const citizenReport: CitizenReportDetails = {
    concerns: input.concerns,
    hasContactDetails: Boolean(input.submitterName || input.submitterContact),
    reference,
    ...(input.concernNote ? { concernNote: input.concernNote } : {}),
    ...(input.shopNameOrLocation ? { shopNameOrLocation: input.shopNameOrLocation } : {}),
  };

  createPipelineRun({
    scanId,
    /*
     * `ScanMetadata` requires a category and a region, and a citizen has
     * neither — the whole premise of this form is that a member of the public
     * should not have to know the taxonomy. Both are synthesised: "Other" is
     * the same choice `createZeroDeclarationDemoRecord` makes, and the region
     * is a named sentinel rather than a real state nobody reported from.
     */
    metadata: { category: "Other", region: CITIZEN_REGION_SENTINEL },
    images: [
      {
        angle: "front",
        fileName: input.photo.fileName,
        url: input.photo.url,
        sizeBytes: input.photo.sizeBytes,
      },
    ],
    scannedByUserId: CITIZEN_ACTOR_ID,
    source: "Citizen-Reported",
    citizenReport,
    ...(input.qualityNote ? { qualityNote: input.qualityNote } : {}),
  });

  /*
   * Resolved straight away rather than left to advance on polling. Nothing
   * polls a citizen submission — they leave with a reference — so the run
   * would otherwise never progress past its first stage and the record would
   * never reach Compliance Records. See `completePipelineRunNow`.
   */
  completePipelineRunNow(scanId);

  grievances.set(reference, {
    reference,
    recordId: `rec-${scanId}`,
    submittedAt,
    ...(input.submitterName ? { submitterName: input.submitterName } : {}),
    ...(input.submitterContact ? { submitterContact: input.submitterContact } : {}),
  });

  return { reference, submittedAt };
}

/* ------------------------------------------------------------------ *
 * Public status lookup
 * ------------------------------------------------------------------ */

/**
 * Internal record state, translated to the three coarse public labels.
 *
 * NO SPEC DEFINES THIS MAPPING. Page 11 and the BRD both name the three labels
 * and both say only that they are "distinct from" the internal Compliance
 * Status. The rules below are a judgement call, and the important one is the
 * last:
 *
 * **`Compliant` and `Non-Compliant` both map to `Resolved`.** A citizen learns
 * that their report was worked, never the enforcement outcome, the officer who
 * handled it, or the rule involved. That is the entire reason the public
 * vocabulary exists as a separate list — 11 §2: "never exposes internal officer
 * workflow detail".
 */
export function publicStatusFor(recordId: string): {
  status: PublicGrievanceStatus;
  lastUpdatedAt: string;
} | null {
  const record = getRecordById(recordId);
  if (!record) return null;

  /*
   * An archived record still reports its last public status. Archiving is an
   * internal housekeeping action, and a citizen whose report simply vanished
   * would reasonably conclude it was never taken seriously.
   */

  if (record.verificationStatus === "Verified" && !record.needsReviewFlag) {
    return { status: "Resolved", lastUpdatedAt: record.lastUpdatedAt };
  }

  const touchedByOfficer =
    record.needsReviewFlag || record.auditTrail.some((event) => event.type === "Corrected");

  return {
    status: touchedByOfficer ? "Under Review" : "Received",
    lastUpdatedAt: record.lastUpdatedAt,
  };
}

export function lookupGrievance(reference: string): GrievanceStatusLookup | null {
  ensureSeeded();
  const normalized = normalizeShortCode(reference);
  const stored = grievances.get(normalized);
  if (!stored) return null;

  if (stored.fixedStatus) {
    return {
      reference: normalized,
      status: stored.fixedStatus,
      lastUpdatedAt: stored.submittedAt,
    };
  }

  const resolved = stored.recordId ? publicStatusFor(stored.recordId) : null;

  /*
   * A submission whose pipeline run has not produced its record yet is still
   * genuinely "Received" — the citizen should not see a not-found for a
   * reference we just issued them.
   */
  return {
    reference: normalized,
    status: resolved?.status ?? "Received",
    lastUpdatedAt: resolved?.lastUpdatedAt ?? stored.submittedAt,
  };
}
