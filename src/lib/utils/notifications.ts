import { ROUTES } from "@/lib/constants";
import type { NotificationEntry, NotificationType } from "@/types";

/**
 * resolveNotificationLink — where clicking a notification should take the
 * officer. Shared between the full `/notifications` page and the header
 * bell's dropdown preview, so the two can never disagree about where a
 * given row leads.
 */
export function resolveNotificationLink(entry: NotificationEntry): string | undefined {
  if (entry.recordId) return ROUTES.recordDetail(entry.recordId);
  if (entry.entityType === "ViolationCase" && entry.entityId) {
    return ROUTES.caseDetail(entry.entityId);
  }
  switch (entry.type) {
    case "account_created":
      return ROUTES.profile;
    case "rule_thresholds_changed":
      return ROUTES.admin;
    default:
      return undefined;
  }
}

/** Material icon ligature per notification type — never colour alone
 * (A-10), always paired with the unread dot/weight distinction. */
export function notificationIcon(type: NotificationType): string {
  switch (type) {
    case "case_reassigned_to_you":
      return "swap_horiz";
    case "record_flagged_needs_review":
      return "flag";
    case "record_needs_review_cleared":
      return "check_circle";
    case "case_status_changed":
      return "gavel";
    case "account_created":
      return "person_add";
    case "rule_thresholds_changed":
      return "tune";
    case "record_flagged_for_enforcement":
      return "report";
    default:
      return "notifications";
  }
}
