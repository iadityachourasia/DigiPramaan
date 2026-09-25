"use client";

import { EmptyState } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { markNotificationRead } from "@/lib/api/notifications";
import { notificationIcon, resolveNotificationLink } from "@/lib/utils/notifications";
import type { NotificationEntry, NotificationType } from "@/types";

/**
 * NotificationsList — the feed itself. A list of cards, not a `DataTable`:
 * notifications aren't tabular data, they're a stream of things to act on.
 * Unread rows get a left accent bar + a dot + bold text — never colour
 * alone (A-10), the same discipline `ReportProgressTracker.tsx`'s failed-
 * stage state already follows.
 */

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export interface NotificationsListProps {
  rows: readonly NotificationEntry[];
  loading: boolean;
  hasActiveFilters: boolean;
  locale: string;
  recordLabels: Record<string, string>;
  onClearFilters: () => void;
  onMarkedRead: (id: string) => void;
  labels: {
    emptyTitle: string;
    emptyBody: string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    clearFilters: string;
    message: (type: NotificationType, detail: Record<string, unknown> | undefined) => string;
    recordPrefix: (scanId: string) => string;
  };
}

export function NotificationsList({
  rows,
  loading,
  hasActiveFilters,
  locale,
  recordLabels,
  onClearFilters,
  onMarkedRead,
  labels,
}: NotificationsListProps) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon="notifications_none"
        title={hasActiveFilters ? labels.emptyFilteredTitle : labels.emptyTitle}
        description={hasActiveFilters ? labels.emptyFilteredBody : labels.emptyBody}
        action={
          hasActiveFilters ? (
            <button type="button" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" onClick={onClearFilters}>
              {labels.clearFilters}
            </button>
          ) : undefined
        }
      />
    );
  }

  function handleClick(entry: NotificationEntry) {
    if (entry.readAt) return;
    onMarkedRead(entry.id);
    void markNotificationRead(entry.id);
  }

  return (
    <ul className="lmcs-notification-list" aria-busy={loading}>
      {rows.map((entry) => {
        const href = resolveNotificationLink(entry);
        const unread = !entry.readAt;
        const content = (
          <>
            <span className="ux4g-icon-outlined lmcs-notification-icon" aria-hidden="true">
              {notificationIcon(entry.type)}
            </span>
            <span className="lmcs-notification-body">
              <span className={unread ? "ux4g-body-m-strong" : "ux4g-body-m-default"}>
                {labels.message(entry.type, entry.detail)}
              </span>
              {entry.recordId && recordLabels[entry.recordId] ? (
                <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
                  {labels.recordPrefix(recordLabels[entry.recordId]!)}
                </span>
              ) : null}
              <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                {formatDateTime(entry.createdAt, locale)}
              </span>
            </span>
            {unread ? (
              <span className="lmcs-notification-unread-dot" aria-hidden="true" />
            ) : null}
          </>
        );

        return (
          <li
            key={entry.id}
            className={`lmcs-notification-row${unread ? " lmcs-notification-row-unread" : ""}`}
          >
            {href ? (
              <Link href={href} className="lmcs-notification-link" onClick={() => handleClick(entry)}>
                {content}
              </Link>
            ) : (
              <button
                type="button"
                className="lmcs-notification-link lmcs-notification-link-button"
                onClick={() => handleClick(entry)}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
