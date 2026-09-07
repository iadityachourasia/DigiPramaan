/**
 * history.ts — the central activity log (13-history-and-hierarchy.md §3).
 *
 * WHY `ActivityEvent` AND NOT `AuditEvent`
 * -----------------------------------------
 * 13 §3.3 specifies this file exporting `AuditEvent` and `AUDIT_EVENT_TYPES`.
 * Those names are already taken by `compliance.ts`, and `types/index.ts`
 * re-exports every module with `export *`, so following the spec literally is
 * a duplicate-export error rather than a style question.
 *
 * The two are not rivals. `ActivityEvent` is the rich, queryable record kept
 * by `lib/server/audit-store.ts` and is the single source of truth for writes.
 * `compliance.ts`'s `AuditEvent` stays exactly as it is, as the coarser
 * per-record projection that page 6's timeline, the PDF renderer and the
 * citizen status lookup already read. One source, two projections — which is
 * what 13's Definition of Done asks for ("read from one shared shape"), just
 * without renaming a type three consumers depend on.
 */

import type { AuditEventType } from "./compliance";
import type { DeclarationFieldId } from "./scan";
import type { Role } from "./vocabulary";

/**
 * Every kind of thing that can happen to a record.
 *
 * 13 §3.3's list, with three deliberate departures:
 *
 * - `needs_review_cleared` is added. Clearing a Needs Review flag is a real
 *   action a Reviewer can take, and it was silently unlogged because the old
 *   seven-literal vocabulary had no word for it. An accountability log that
 *   records raising a flag but not lowering it is worse than none.
 * - `ocr_retried` is added, for Retry OCR (04). It replaces every extracted
 *   declaration and destroys prior corrections, and logged nothing at all.
 * - `case_reassigned` is declared but never emitted. It belongs to the
 *   unbuilt Admin Console's reassignment flow (13 §4.2); it is kept so the
 *   vocabulary matches the spec rather than quietly diverging.
 *
 * There is deliberately no citizen-specific type. A public submission is a
 * `scan_created` like any other; what makes it a citizen report is the absent
 * actor, not a separate word for it.
 */
export const ACTIVITY_EVENT_TYPES = [
  "scan_created",
  "image_quality_failed",
  "image_quality_passed",
  "ocr_completed",
  "ocr_fallback_used",
  "ocr_retried",
  "llm_structuring_completed",
  "rule_engine_completed",
  "field_corrected",
  "confirm_and_verify",
  "flagged_needs_review",
  "needs_review_cleared",
  "flagged_for_enforcement",
  "report_generated",
  "report_downloaded",
  "record_archived",
  "case_reassigned",
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export interface ActivityEvent {
  id: string;
  recordId: string;
  type: ActivityEventType;
  /**
   * Absent for system-generated events — every pipeline stage — and for the
   * Citizen Grievance Portal, which has no signed-in user by design.
   */
  actorUserId?: string;
  actorRole?: Role;
  /** Human-readable one-liner. Never the only carrier of structured data. */
  detail?: string;
  /** Present on `field_corrected`. */
  fieldId?: DeclarationFieldId;
  oldValue?: string;
  newValue?: string;
  /**
   * The record's region at the time the event happened, denormalised.
   *
   * 13 §3.2 wants the Activity Log filterable by "region/jurisdiction", but
   * the Jurisdiction model in §4 is entirely on paper — it belongs to the
   * unbuilt Admin Console, and `User` carries a flat `region` string today.
   * So region stands in, and it is copied rather than joined: an event is a
   * historical fact, and correcting a record's region later should not
   * silently rewrite where past events are recorded as having happened.
   */
  region?: string;
  /** ISO 8601. */
  createdAt: string;
}

/**
 * How each activity type maps onto the coarser `AuditEventType` that page 6's
 * timeline renders, or `null` for the machine-generated events that stay out
 * of it.
 *
 * This is what keeps the per-record timeline readable. 13 §3.1 does ask for a
 * richer timeline including per-stage OCR detail, but filling an
 * already-shipped tab with pipeline noise in the same change that rewrites
 * ten write paths is two changes wearing one coat. The store records
 * everything; the tab keeps showing what it shows today, and §3.1's fuller
 * timeline is a deliberate later step.
 */
export const ACTIVITY_TO_AUDIT_TYPE: Record<ActivityEventType, AuditEventType | null> = {
  scan_created: "Scanned",
  image_quality_failed: null,
  image_quality_passed: null,
  ocr_completed: "Extracted",
  ocr_fallback_used: null,
  ocr_retried: null,
  llm_structuring_completed: null,
  rule_engine_completed: null,
  field_corrected: "Corrected",
  confirm_and_verify: "Verified",
  flagged_needs_review: "Flagged as Needs Review",
  needs_review_cleared: null,
  flagged_for_enforcement: "Flagged for Enforcement",
  report_generated: "Report Generated",
  report_downloaded: null,
  record_archived: null,
  case_reassigned: null,
};

/* ------------------------------------------------------------------ *
 * Querying (Global Activity Log, 13 §3.2)
 * ------------------------------------------------------------------ */

/**
 * Two actor values that are not users.
 *
 * Most events have no `actorUserId` at all — every pipeline stage is machine
 * work, and a citizen submission has no account by design. Without a way to
 * name those, the actor filter could not express "show me only what people
 * did", which is the question this page exists to answer.
 */
export const SYSTEM_ACTOR_FILTER = "__system";
export const CITIZEN_ACTOR_FILTER = "__citizen";

export interface ActivityFilters {
  /** User ids, plus the two sentinels above. Empty means no actor filter. */
  actorUserIds: string[];
  types: ActivityEventType[];
  regions: string[];
  /** ISO 8601 dates, compared as strings the way `RecordFilters` already does. */
  dateFrom?: string;
  dateTo?: string;
  /** Deep-link only — arriving from one record's History tab. */
  recordId?: string;
}

export const ACTIVITY_SORT_OPTIONS = ["newest", "oldest"] as const;
export type ActivitySort = (typeof ACTIVITY_SORT_OPTIONS)[number];

export interface ActivityPage {
  rows: ActivityEvent[];
  /** Total matching the filters, for "Showing 1-20 of 36". */
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Rows above which the log should start defaulting to a bounded date window.
 *
 * Deliberately unused today. The seed backfill produces 36 events and a live
 * scan adds about 7, so loading everything is free — and an accountability
 * surface that hides most of its own history behind a default filter would be
 * misleading. Named here rather than left as an undocumented judgement so the
 * switch-on point is a decision someone can find.
 */
export const ACTIVITY_LOG_DEFAULT_WINDOW_THRESHOLD = 2000;
