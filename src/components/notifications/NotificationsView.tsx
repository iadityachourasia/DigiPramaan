"use client";

import { useTranslations } from "next-intl";

import { ErrorState, Pagination } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useNotifications, useUnreadNotificationCount } from "@/lib/hooks";
import { markAllNotificationsRead } from "@/lib/api/notifications";
import type { NotificationType } from "@/types";

import { NotificationFilters } from "./NotificationFilters";
import { NotificationsList } from "./NotificationsList";

/**
 * NotificationsView — the full Notifications & Alerts page.
 *
 * No permission gate — unlike the Activity Log (a system-wide audit trail,
 * Admin/Reviewer only), this is a personal inbox: every authenticated role
 * sees their own, and there is nothing to authorize beyond being signed in.
 */
export function NotificationsView({ locale }: { locale: string }) {
  const t = useTranslations("notifications");

  const notifications = useNotifications();
  const { refresh: refreshUnreadCount } = useUnreadNotificationCount();

  function handleMarkAllRead() {
    notifications.markAllReadLocally();
    void markAllNotificationsRead().then(() => refreshUnreadCount());
  }

  function handleMarkedRead(id: string) {
    notifications.markReadLocally(id);
    refreshUnreadCount();
  }

  if (notifications.error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <Link href={ROUTES.notifications} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
            {t("retry")}
          </Link>
        }
      />
    );
  }

  const rows = notifications.data?.rows ?? [];
  const totalCount = notifications.data?.totalCount ?? 0;
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const from = totalCount === 0 ? 0 : (notifications.page - 1) * notifications.pageSize + 1;
  const to = Math.min(notifications.page * notifications.pageSize, totalCount);

  return (
    <div className="lmcs-page-section">
      <div className="lmcs-report-actions">
        {unreadCount > 0 ? (
          <button type="button" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" onClick={handleMarkAllRead}>
            {t("markAllRead", { count: unreadCount })}
          </button>
        ) : null}
      </div>

      <NotificationFilters
        read={notifications.filters.read}
        types={notifications.filters.types}
        hasActiveFilters={notifications.hasActiveFilters}
        onSetRead={notifications.setReadFilter}
        onToggleType={notifications.toggleTypeFilter}
        onClearAll={notifications.clearAll}
        labels={{
          heading: t("filters.heading"),
          readLabel: t("filters.readLabel"),
          all: t("filters.all"),
          unread: t("filters.unread"),
          read: t("filters.read"),
          typeLabel: t("filters.typeLabel"),
          addValue: t("filters.addValue"),
          clearAll: t("filters.clearAll"),
          removeFilter: (label) => t("filters.removeFilter", { label }),
          type: (type: NotificationType) => t(`type.${type}.label`),
          typeChip: (value) => t("filters.chip.type", { value }),
        }}
      />

      <NotificationsList
        rows={rows}
        loading={notifications.loading}
        hasActiveFilters={notifications.hasActiveFilters}
        locale={locale}
        recordLabels={notifications.data?.recordLabels ?? {}}
        onClearFilters={notifications.clearAll}
        onMarkedRead={handleMarkedRead}
        labels={{
          emptyTitle: t("emptyTitle"),
          emptyBody: t("emptyBody"),
          emptyFilteredTitle: t("emptyFilteredTitle"),
          emptyFilteredBody: t("emptyFilteredBody"),
          clearFilters: t("filters.clearAll"),
          message: (type, detail) => t(`type.${type}.message`, detail as Record<string, string>),
          recordPrefix: (scanId) => t("recordPrefix", { scanId }),
        }}
      />

      {totalCount > 0 ? (
        <div className="lmcs-records-pagination-row">
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("showing", { from, to, total: totalCount })}
          </p>
          <Pagination
            page={notifications.page}
            pageSize={notifications.pageSize}
            totalCount={totalCount}
            onPageChange={notifications.setPage}
            labels={{
              navLabel: t("pagination.navLabel"),
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              pageLabel: (n) => t("pagination.pageLabel", { page: n }),
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
