"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { EmptyState, ErrorState, Pagination } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useActivityLog, usePermission } from "@/lib/hooks";
import type { ActivityEventType, ActivitySort } from "@/types";

import { ActivityFilters } from "./ActivityFilters";
import { ActivityTable } from "./ActivityTable";

/**
 * ActivityView — the Global Activity Log (13 §3.2).
 *
 * The accountability surface across all records: "show me everything Officer X
 * did last week", "show me every Flag as Needs Review in Maharashtra this
 * month". Every filter is a real query parameter, and the whole filter state
 * lives in the URL so a link to a particular view can be sent to someone.
 *
 * This is also the first surface where seven event types are visible at all.
 * The per-record projection maps them to `null`, so archiving, cleared Needs
 * Review flags, re-extraction and every pipeline stage are logged today and
 * shown nowhere else.
 *
 * No default date range. The log holds roughly forty events, so loading it is
 * free, and an accountability page that hides most of its own history behind a
 * default filter would be misleading. See
 * `ACTIVITY_LOG_DEFAULT_WINDOW_THRESHOLD` for where that stops being true.
 */
export function ActivityView({ locale }: { locale: string }) {
  const t = useTranslations("activity");
  const tVocab = useTranslations("vocabulary");
  const searchParams = useSearchParams();
  const demoState = searchParams.get("demo") ?? undefined;

  const canView = usePermission("activity.view");

  const log = useActivityLog(demoState);

  /*
   * The nav already hides this entry from an Enforcement Officer, but the
   * route stays reachable by URL, so the page states the refusal itself. An
   * in-place EmptyState rather than a redirect, matching how the scan wizard
   * refuses a Reviewer: a redirect would bounce someone who followed a
   * colleague's link without ever saying why.
   */
  if (!canView) {
    return <EmptyState icon="block" title={t("noAccessTitle")} description={t("noAccessBody")} />;
  }

  if (log.error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <Link href={ROUTES.activity} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
            {t("retry")}
          </Link>
        }
      />
    );
  }

  const rows = log.data?.rows ?? [];
  const totalCount = log.data?.totalCount ?? 0;
  const from = totalCount === 0 ? 0 : (log.page - 1) * log.pageSize + 1;
  const to = Math.min(log.page * log.pageSize, totalCount);

  return (
    <div className="lmcs-page-section">
      <ActivityFilters
        filters={log.filters}
        sort={log.sort}
        hasActiveFilters={log.hasActiveFilters}
        availableRegions={log.availableRegions}
        onToggleFilterValue={log.toggleFilterValue}
        onSetDateRange={log.setDateRange}
        onSetSort={(sort: ActivitySort) => log.setSort(sort)}
        onClearAll={log.clearAll}
        labels={{
          heading: t("filters.heading"),
          actorLabel: t("filters.actorLabel"),
          typeLabel: t("filters.typeLabel"),
          regionLabel: t("filters.regionLabel"),
          dateFromLabel: t("filters.dateFromLabel"),
          dateToLabel: t("filters.dateToLabel"),
          sortLabel: t("filters.sortLabel"),
          sortNewest: t("filters.sortNewest"),
          sortOldest: t("filters.sortOldest"),
          addValue: t("filters.addValue"),
          clearAll: t("filters.clearAll"),
          removeFilter: (label) => t("filters.removeFilter", { label }),
          system: t("actor.system"),
          citizen: t("actor.citizen"),
          eventType: (type: ActivityEventType) => t(`eventType.${type}`),
          actorChip: (value) => t("filters.chip.actor", { value }),
          typeChip: (value) => t("filters.chip.type", { value }),
          regionChip: (value) => t("filters.chip.region", { value }),
          dateFromChip: (value) => t("filters.chip.dateFrom", { value }),
          dateToChip: (value) => t("filters.chip.dateTo", { value }),
          recordChip: (value) => t("filters.chip.record", { value }),
        }}
      />

      <ActivityTable
        rows={rows}
        loading={log.loading}
        hasActiveFilters={log.hasActiveFilters}
        locale={locale}
        recordLabels={log.data?.recordLabels ?? {}}
        onClearFilters={log.clearAll}
        labels={{
          caption: t("table.caption"),
          columnWhen: t("table.columnWhen"),
          columnWho: t("table.columnWho"),
          columnWhat: t("table.columnWhat"),
          columnRecord: t("table.columnRecord"),
          columnRegion: t("table.columnRegion"),
          columnDetail: t("table.columnDetail"),
          system: t("actor.system"),
          citizen: t("actor.citizen"),
          viewRecord: (record) => t("table.viewRecord", { record }),
          eventType: (type: ActivityEventType) => t(`eventType.${type}`),
          roleSuffix: (role) => t("table.roleSuffix", { role: tVocab(`role.${role}`) }),
          changedFrom: (fromValue, toValue) =>
            t("table.changedFrom", { from: fromValue, to: toValue }),
          emptyFilteredTitle: t("table.emptyFilteredTitle"),
          emptyFilteredBody: t("table.emptyFilteredBody"),
          clearFilters: t("filters.clearAll"),
          emptyTitle: t("table.emptyTitle"),
          emptyBody: t("table.emptyBody"),
        }}
      />

      {totalCount > 0 ? (
        <div className="lmcs-records-pagination-row">
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("showing", { from, to, total: totalCount })}
          </p>
          <Pagination
            page={log.page}
            pageSize={log.pageSize}
            totalCount={totalCount}
            onPageChange={log.setPage}
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
