/**
 * notifications.ts — the per-officer Notifications & Alerts feed.
 *
 * Distinct from `history.ts`'s `ActivityEvent`/`ACTIVITY_EVENT_TYPES`: that
 * is a system-wide audit trail (everything that happened, to anyone,
 * queryable by an Admin/Reviewer); this is a personal inbox (things a
 * specific signed-in user should be told about, with read/unread state).
 * `NOTIFICATION_TYPES` is deliberately a small, curated subset — not every
 * `ActivityEventType`, only what a person actually needs to be notified of.
 *
 * Kept in sync by hand with `backend/app/services/notifications/
 * vocabulary.py`'s own `NOTIFICATION_TYPES` — same duplication discipline
 * `history.ts`'s own comment documents for its backend counterpart, and the
 * one that produced a real, confirmed bug when it wasn't followed (16
 * backend event types with no frontend/i18n entry, throwing MISSING_MESSAGE
 * on every render). Update both files in the same change that adds a type.
 */

export const NOTIFICATION_TYPES = [
  "case_reassigned_to_you",
  "record_flagged_needs_review",
  "record_needs_review_cleared",
  "case_status_changed",
  "account_created",
  "rule_thresholds_changed",
  "record_flagged_for_enforcement",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationEntry {
  id: string;
  type: NotificationType;
  createdAt: string;
  /** Absent/undefined means unread. */
  readAt?: string;
  recordId?: string;
  entityType?: string;
  entityId?: string;
  /** Dynamic per-type fields (fromOfficerId, fromStatus/toStatus, caseId,
   * role, note, ...) — the exact set depends on `type`, resolved by the
   * matching `notifications.type.<type>` i18n template. */
  detail?: Record<string, unknown>;
}

export interface NotificationFilters {
  /** `undefined` means no read-state filter (show both) — a required key
   * whose value may be `undefined`, not an optional key, since the filter
   * is always conceptually present (All/Unread/Read). */
  read: boolean | undefined;
  types: NotificationType[];
}

export interface NotificationPage {
  rows: NotificationEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  unreadCount: number;
  /** Record id → scan id, for a row that references a record — same
   * convention `ActivityPageResponse.recordLabels` already established. */
  recordLabels: Record<string, string>;
}
