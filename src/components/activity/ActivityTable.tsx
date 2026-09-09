"use client";

import { DataTable, type DataTableColumn } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { findMockUser } from "@/lib/mock/users";
import { formatShortDate } from "@/lib/utils/format";
import { CITIZEN_ACTOR_ID, type ActivityEvent, type ActivityEventType } from "@/types";

/**
 * ActivityTable — the accountability feed (13 §3.2).
 *
 * A table, not page 6's timeline. That timeline is bounded to one record and
 * has no columns, so it cannot say which record an event belongs to — the
 * single most important thing here. Compliance Records is the real precedent
 * for a filtered cross-record list, so this is its `DataTable` treatment, with
 * page 6's date formatting and label-map approach carried over.
 */

export interface ActivityTableProps {
  rows: readonly ActivityEvent[];
  loading: boolean;
  hasActiveFilters: boolean;
  locale: string;
  /** Scan id per record, so a row can show something a person recognises. */
  recordLabels: Record<string, string>;
  onClearFilters: () => void;
  labels: {
    caption: string;
    columnWhen: string;
    columnWho: string;
    columnWhat: string;
    columnRecord: string;
    columnRegion: string;
    columnDetail: string;
    system: string;
    citizen: string;
    viewRecord: (record: string) => string;
    eventType: (type: ActivityEventType) => string;
    roleSuffix: (role: string) => string;
    changedFrom: (from: string, to: string) => string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    clearFilters: string;
    emptyTitle: string;
    emptyBody: string;
  };
}

function formatDateTime(iso: string, locale: string): string {
  return `${formatShortDate(iso, locale)}, ${new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function ActivityTable({
  rows,
  loading,
  hasActiveFilters,
  locale,
  recordLabels,
  onClearFilters,
  labels,
}: ActivityTableProps) {
  const columns: DataTableColumn<ActivityEvent>[] = [
    {
      key: "when",
      header: labels.columnWhen,
      cardHeading: true,
      render: (event) => formatDateTime(event.createdAt, locale),
    },
    {
      key: "who",
      header: labels.columnWho,
      render: (event) => {
        /*
         * Three cases, and none of them is a lie. No actor means the pipeline
         * did it; the citizen sentinel is a real person with no account; a
         * user id resolves to a name and role.
         */
        if (!event.actorUserId) return labels.system;
        if (event.actorUserId === CITIZEN_ACTOR_ID) return labels.citizen;

        const user = findMockUser(event.actorUserId);
        return (
          <>
            {user?.fullName ?? event.actorUserId}
            {event.actorRole ? (
              <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                {" "}
                {labels.roleSuffix(event.actorRole)}
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      key: "what",
      header: labels.columnWhat,
      render: (event) => labels.eventType(event.type),
    },
    {
      key: "record",
      header: labels.columnRecord,
      render: (event) => event.recordId ? (
        <Link
          href={ROUTES.recordDetail(event.recordId)}
          className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
          aria-label={labels.viewRecord(recordLabels[event.recordId] ?? event.recordId)}
        >
          {recordLabels[event.recordId] ?? event.recordId}
        </Link>
      ) : "—",
    },
    {
      key: "region",
      header: labels.columnRegion,
      render: (event) => event.region ?? "—",
    },
    {
      key: "detail",
      header: labels.columnDetail,
      render: (event) => {
        /* A correction is the one event whose before/after is the point, and
         * session 1 started capturing both. */
        if (event.fieldId && event.newValue !== undefined) {
          return labels.changedFrom(event.oldValue ?? "—", event.newValue);
        }
        return event.detail ?? "—";
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(event) => event.id}
      size="s"
      caption={labels.caption}
      loading={loading}
      emptyState={
        hasActiveFilters
          ? {
              icon: "search_off",
              title: labels.emptyFilteredTitle,
              description: labels.emptyFilteredBody,
              action: (
                <button
                  type="button"
                  className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
                  onClick={onClearFilters}
                >
                  {labels.clearFilters}
                </button>
              ),
            }
          : { icon: "history", title: labels.emptyTitle, description: labels.emptyBody }
      }
    />
  );
}
