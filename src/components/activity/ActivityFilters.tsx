"use client";

import { FilterChip } from "@/components/shared";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { MOCK_USERS } from "@/lib/mock/users";
import type { ActivityMultiKey } from "@/lib/hooks";
import {
  ACTIVITY_EVENT_TYPES,
  CITIZEN_ACTOR_FILTER,
  SYSTEM_ACTOR_FILTER,
  type ActivityEventType,
  type ActivityFilters as Filters,
  type ActivitySort,
} from "@/types";

/**
 * ActivityFilters — the four dimensions 13 §3.2 names (13 §3.2).
 *
 * Reuses Compliance Records' select-then-chip pattern rather than inventing a
 * multi-select: `Select.tsx`'s own doc comment flags a real combobox as a
 * larger undertaking, and this is the established answer to that gap here.
 *
 * Every dimension is a real query parameter on `listActivity`, not a
 * client-side pass over fetched rows. A filter bar that says "region:
 * Maharashtra" while actually post-processing an array misrepresents what it
 * did, and breaks the moment the log outgrows one fetch.
 */

export interface ActivityFiltersProps {
  filters: Filters;
  sort: ActivitySort;
  hasActiveFilters: boolean;
  availableRegions: readonly string[];
  onToggleFilterValue: (key: ActivityMultiKey, value: string) => void;
  onSetDateRange: (dateFrom: string, dateTo: string) => void;
  onSetSort: (sort: ActivitySort) => void;
  onClearAll: () => void;
  labels: {
    heading: string;
    actorLabel: string;
    typeLabel: string;
    regionLabel: string;
    dateFromLabel: string;
    dateToLabel: string;
    sortLabel: string;
    sortNewest: string;
    sortOldest: string;
    addValue: string;
    clearAll: string;
    removeFilter: (label: string) => string;
    system: string;
    citizen: string;
    eventType: (type: ActivityEventType) => string;
    actorChip: (value: string) => string;
    typeChip: (value: string) => string;
    regionChip: (value: string) => string;
    dateFromChip: (value: string) => string;
    dateToChip: (value: string) => string;
    recordChip: (value: string) => string;
  };
}

export function ActivityFilters({
  filters,
  sort,
  hasActiveFilters,
  availableRegions,
  onToggleFilterValue,
  onSetDateRange,
  onSetSort,
  onClearAll,
  labels,
}: ActivityFiltersProps) {
  /*
   * The actor list carries two entries that are not users. Most events have no
   * actor at all — every pipeline stage is machine work — and a citizen
   * submission has no account by design. Without both, the filter cannot
   * express "show me only what people did", which is the page's whole purpose.
   */
  const actorOptions = [
    ...MOCK_USERS.map((user) => ({ label: user.fullName, value: user.id })),
    { label: labels.system, value: SYSTEM_ACTOR_FILTER },
    { label: labels.citizen, value: CITIZEN_ACTOR_FILTER },
  ];

  function actorLabelFor(value: string): string {
    if (value === SYSTEM_ACTOR_FILTER) return labels.system;
    if (value === CITIZEN_ACTOR_FILTER) return labels.citizen;
    return MOCK_USERS.find((user) => user.id === value)?.fullName ?? value;
  }

  return (
    <section aria-labelledby="activity-filters-heading" className="lmcs-records-filters">
      <h2 id="activity-filters-heading" className="ux4g-sr-only">
        {labels.heading}
      </h2>

      <div className="lmcs-records-filters-row">
        <Select
          id="activity-filter-actor"
          label={labels.actorLabel}
          placeholder={labels.addValue}
          options={actorOptions}
          value=""
          onChange={(event) => onToggleFilterValue("actorUserIds", event.target.value)}
        />
        <Select
          id="activity-filter-type"
          label={labels.typeLabel}
          placeholder={labels.addValue}
          options={ACTIVITY_EVENT_TYPES.map((type) => ({
            label: labels.eventType(type),
            value: type,
          }))}
          value=""
          onChange={(event) => onToggleFilterValue("types", event.target.value)}
        />
        <Select
          id="activity-filter-region"
          label={labels.regionLabel}
          placeholder={labels.addValue}
          /* Only regions the log actually contains, so the filter never offers
           * a value that can only return nothing. */
          options={availableRegions.map((region) => ({ label: region, value: region }))}
          value=""
          onChange={(event) => onToggleFilterValue("regions", event.target.value)}
        />
      </div>

      <div className="lmcs-records-filters-row">
        <TextField
          id="activity-filter-date-from"
          label={labels.dateFromLabel}
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(event) => onSetDateRange(event.target.value, filters.dateTo ?? "")}
        />
        <TextField
          id="activity-filter-date-to"
          label={labels.dateToLabel}
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(event) => onSetDateRange(filters.dateFrom ?? "", event.target.value)}
        />
        <Select
          id="activity-sort"
          label={labels.sortLabel}
          options={[
            { label: labels.sortNewest, value: "newest" },
            { label: labels.sortOldest, value: "oldest" },
          ]}
          value={sort}
          onChange={(event) => onSetSort(event.target.value as ActivitySort)}
        />
      </div>

      {hasActiveFilters ? (
        <div className="lmcs-records-filter-chips">
          {filters.recordId ? (
            <FilterChip
              label={labels.recordChip(filters.recordId)}
              removeLabel={labels.removeFilter(labels.recordChip(filters.recordId))}
              onRemove={onClearAll}
            />
          ) : null}
          {filters.dateFrom ? (
            <FilterChip
              label={labels.dateFromChip(filters.dateFrom)}
              removeLabel={labels.removeFilter(labels.dateFromChip(filters.dateFrom))}
              onRemove={() => onSetDateRange("", filters.dateTo ?? "")}
            />
          ) : null}
          {filters.dateTo ? (
            <FilterChip
              label={labels.dateToChip(filters.dateTo)}
              removeLabel={labels.removeFilter(labels.dateToChip(filters.dateTo))}
              onRemove={() => onSetDateRange(filters.dateFrom ?? "", "")}
            />
          ) : null}
          {filters.actorUserIds.map((value) => (
            <FilterChip
              key={`actor-${value}`}
              label={labels.actorChip(actorLabelFor(value))}
              removeLabel={labels.removeFilter(actorLabelFor(value))}
              onRemove={() => onToggleFilterValue("actorUserIds", value)}
            />
          ))}
          {filters.types.map((value) => (
            <FilterChip
              key={`type-${value}`}
              label={labels.typeChip(labels.eventType(value))}
              removeLabel={labels.removeFilter(labels.eventType(value))}
              onRemove={() => onToggleFilterValue("types", value)}
            />
          ))}
          {filters.regions.map((value) => (
            <FilterChip
              key={`region-${value}`}
              label={labels.regionChip(value)}
              removeLabel={labels.removeFilter(value)}
              onRemove={() => onToggleFilterValue("regions", value)}
            />
          ))}
          <button
            type="button"
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
            onClick={onClearAll}
          >
            {labels.clearAll}
          </button>
        </div>
      ) : null}
    </section>
  );
}
