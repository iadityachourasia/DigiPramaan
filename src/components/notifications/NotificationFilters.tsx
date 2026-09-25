"use client";

import { FilterChip } from "@/components/shared";
import { Select } from "@/components/ui/Select";
import { NOTIFICATION_TYPES, type NotificationType } from "@/types";

/**
 * NotificationFilters — read-state (All/Unread/Read) plus a type filter.
 *
 * The type filter reuses Compliance Records/Activity Log's own
 * select-then-chip composition (`Select.tsx`'s own doc comment already
 * flags a real multi-select combobox as a larger undertaking this app
 * hasn't taken on). Read-state uses the three-button toggle-group pattern
 * `TrendPanel.tsx`'s Weekly/Monthly control already established — there is
 * no `ux4g-btn-group` class in the package, so this is the same plain flex
 * row using the shared gap token.
 */

export interface NotificationFiltersProps {
  read: boolean | undefined;
  types: readonly NotificationType[];
  hasActiveFilters: boolean;
  onSetRead: (read: boolean | undefined) => void;
  onToggleType: (type: NotificationType) => void;
  onClearAll: () => void;
  labels: {
    heading: string;
    readLabel: string;
    all: string;
    unread: string;
    read: string;
    typeLabel: string;
    addValue: string;
    clearAll: string;
    removeFilter: (label: string) => string;
    type: (type: NotificationType) => string;
    typeChip: (value: string) => string;
  };
}

export function NotificationFilters({
  read,
  types,
  hasActiveFilters,
  onSetRead,
  onToggleType,
  onClearAll,
  labels,
}: NotificationFiltersProps) {
  return (
    <section aria-labelledby="notification-filters-heading" className="lmcs-records-filters">
      <h2 id="notification-filters-heading" className="ux4g-sr-only">
        {labels.heading}
      </h2>

      <div className="lmcs-trend-toggle" role="group" aria-label={labels.readLabel}>
        <button
          type="button"
          className={`ux4g-btn ux4g-btn-sm ${read === undefined ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"}`}
          aria-pressed={read === undefined}
          onClick={() => onSetRead(undefined)}
        >
          {labels.all}
        </button>
        <button
          type="button"
          className={`ux4g-btn ux4g-btn-sm ${read === false ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"}`}
          aria-pressed={read === false}
          onClick={() => onSetRead(false)}
        >
          {labels.unread}
        </button>
        <button
          type="button"
          className={`ux4g-btn ux4g-btn-sm ${read === true ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"}`}
          aria-pressed={read === true}
          onClick={() => onSetRead(true)}
        >
          {labels.read}
        </button>
      </div>

      <div className="lmcs-records-filters-row">
        <Select
          id="notification-filter-type"
          label={labels.typeLabel}
          placeholder={labels.addValue}
          options={NOTIFICATION_TYPES.map((type) => ({ label: labels.type(type), value: type }))}
          value=""
          onChange={(event) => onToggleType(event.target.value as NotificationType)}
        />
      </div>

      {hasActiveFilters ? (
        <div className="lmcs-records-filter-chips">
          {types.map((value) => (
            <FilterChip
              key={`type-${value}`}
              label={labels.typeChip(labels.type(value))}
              removeLabel={labels.removeFilter(labels.type(value))}
              onRemove={() => onToggleType(value)}
            />
          ))}
          <button type="button" className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm" onClick={onClearAll}>
            {labels.clearAll}
          </button>
        </div>
      ) : null}
    </section>
  );
}
