"use client";

import { useEffect, useState } from "react";

import { FilterChip } from "@/components/shared";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useDebounce, type MultiFilterKey } from "@/lib/hooks";
import type { RecordFilters, RecordSort } from "@/types";

/**
 * RecordsFilters — search, the 6 filter dimensions, sort, and the active
 * filter chips (05-compliance-records.md §2). All filters stay visible at
 * once rather than collapsed behind one button, per the spec's explicit
 * instruction.
 *
 * Each multi-value dimension (category, status, region, manufacturer,
 * source) reuses the existing single-value `Select` unchanged as an
 * "add a value" picker — picking an option appends that value as a chip and
 * the select resets, rather than building a new multi-select combobox
 * `Select.tsx`'s own doc comment already flags as a bigger undertaking than
 * this app's short, fixed option lists need.
 */

export interface RecordsFiltersProps {
  filters: RecordFilters;
  sort: RecordSort;
  hasActiveFilters: boolean;
  onToggleFilterValue: (key: MultiFilterKey, value: string) => void;
  onSetQuery: (value: string) => void;
  onSetDateRange: (dateFrom: string, dateTo: string) => void;
  onSetSort: (sort: RecordSort) => void;
  onClearAll: () => void;
  options: {
    categories: readonly SelectOption[];
    complianceStatuses: readonly SelectOption[];
    regions: readonly SelectOption[];
    manufacturers: readonly SelectOption[];
    sources: readonly SelectOption[];
  };
  labels: {
    searchLabel: string;
    searchPlaceholder: string;
    categoryLabel: string;
    statusLabel: string;
    regionLabel: string;
    manufacturerLabel: string;
    sourceLabel: string;
    dateFromLabel: string;
    dateToLabel: string;
    sortLabel: string;
    sortOptions: Record<RecordSort, string>;
    clearAll: string;
    removeFilter: (label: string) => string;
    addFilterPlaceholder: string;
    categoryChipLabel: (value: string) => string;
    statusChipLabel: (value: string) => string;
    regionChipLabel: (value: string) => string;
    manufacturerChipLabel: (value: string) => string;
    sourceChipLabel: (value: string) => string;
    queryChipLabel: (value: string) => string;
    dateFromChipLabel: (value: string) => string;
    dateToChipLabel: (value: string) => string;
  };
}

const SORT_OPTIONS: readonly RecordSort[] = [
  "newest",
  "oldest",
  "alphabetical",
  "status",
  "relevance",
];

export function RecordsFilters({
  filters,
  sort,
  hasActiveFilters,
  onToggleFilterValue,
  onSetQuery,
  onSetDateRange,
  onSetSort,
  onClearAll,
  options,
  labels,
}: RecordsFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.query ?? "");
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== (filters.query ?? "")) onSetQuery(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only when the debounced value itself changes; including filters.query would re-fire on every URL-driven update (e.g. a chip removal) and fight this input's own local edits.
  }, [debouncedSearch]);

  return (
    <div className="lmcs-records-filters">
      <div className="lmcs-records-filters-row">
        <TextField
          id="records-search"
          label={labels.searchLabel}
          placeholder={labels.searchPlaceholder}
          leadingIcon="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />

        <Select
          id="records-filter-category"
          label={labels.categoryLabel}
          placeholder={labels.addFilterPlaceholder}
          options={options.categories}
          value=""
          onChange={(event) => {
            if (event.target.value) onToggleFilterValue("categories", event.target.value);
          }}
        />
        <Select
          id="records-filter-status"
          label={labels.statusLabel}
          placeholder={labels.addFilterPlaceholder}
          options={options.complianceStatuses}
          value=""
          onChange={(event) => {
            if (event.target.value) onToggleFilterValue("complianceStatuses", event.target.value);
          }}
        />
        <Select
          id="records-filter-region"
          label={labels.regionLabel}
          placeholder={labels.addFilterPlaceholder}
          options={options.regions}
          value=""
          onChange={(event) => {
            if (event.target.value) onToggleFilterValue("regions", event.target.value);
          }}
        />
        <Select
          id="records-filter-manufacturer"
          label={labels.manufacturerLabel}
          placeholder={labels.addFilterPlaceholder}
          options={options.manufacturers}
          value=""
          onChange={(event) => {
            if (event.target.value) onToggleFilterValue("manufacturers", event.target.value);
          }}
        />
        <Select
          id="records-filter-source"
          label={labels.sourceLabel}
          placeholder={labels.addFilterPlaceholder}
          options={options.sources}
          value=""
          onChange={(event) => {
            if (event.target.value) onToggleFilterValue("sources", event.target.value);
          }}
        />

        <TextField
          id="records-filter-date-from"
          type="date"
          label={labels.dateFromLabel}
          value={filters.dateFrom ?? ""}
          onChange={(event) => onSetDateRange(event.target.value, filters.dateTo ?? "")}
        />
        <TextField
          id="records-filter-date-to"
          type="date"
          label={labels.dateToLabel}
          value={filters.dateTo ?? ""}
          onChange={(event) => onSetDateRange(filters.dateFrom ?? "", event.target.value)}
        />

        <Select
          id="records-sort"
          label={labels.sortLabel}
          options={SORT_OPTIONS.map((option) => ({ label: labels.sortOptions[option], value: option }))}
          value={sort}
          onChange={(event) => onSetSort(event.target.value as RecordSort)}
        />
      </div>

      {hasActiveFilters ? (
        <div className="lmcs-records-filter-chips">
          {filters.query ? (
            <FilterChip
              label={labels.queryChipLabel(filters.query)}
              removeLabel={labels.removeFilter(labels.queryChipLabel(filters.query))}
              onRemove={() => onSetQuery("")}
            />
          ) : null}
          {filters.dateFrom ? (
            <FilterChip
              label={labels.dateFromChipLabel(filters.dateFrom)}
              removeLabel={labels.removeFilter(labels.dateFromChipLabel(filters.dateFrom))}
              onRemove={() => onSetDateRange("", filters.dateTo ?? "")}
            />
          ) : null}
          {filters.dateTo ? (
            <FilterChip
              label={labels.dateToChipLabel(filters.dateTo)}
              removeLabel={labels.removeFilter(labels.dateToChipLabel(filters.dateTo))}
              onRemove={() => onSetDateRange(filters.dateFrom ?? "", "")}
            />
          ) : null}
          {filters.categories.map((value) => (
            <FilterChip
              key={`categories-${value}`}
              label={labels.categoryChipLabel(value)}
              removeLabel={labels.removeFilter(labels.categoryChipLabel(value))}
              onRemove={() => onToggleFilterValue("categories", value)}
            />
          ))}
          {filters.complianceStatuses.map((value) => (
            <FilterChip
              key={`complianceStatuses-${value}`}
              label={labels.statusChipLabel(value)}
              removeLabel={labels.removeFilter(labels.statusChipLabel(value))}
              onRemove={() => onToggleFilterValue("complianceStatuses", value)}
            />
          ))}
          {filters.regions.map((value) => (
            <FilterChip
              key={`regions-${value}`}
              label={labels.regionChipLabel(value)}
              removeLabel={labels.removeFilter(labels.regionChipLabel(value))}
              onRemove={() => onToggleFilterValue("regions", value)}
            />
          ))}
          {filters.manufacturers.map((value) => (
            <FilterChip
              key={`manufacturers-${value}`}
              label={labels.manufacturerChipLabel(value)}
              removeLabel={labels.removeFilter(labels.manufacturerChipLabel(value))}
              onRemove={() => onToggleFilterValue("manufacturers", value)}
            />
          ))}
          {filters.sources.map((value) => (
            <FilterChip
              key={`sources-${value}`}
              label={labels.sourceChipLabel(value)}
              removeLabel={labels.removeFilter(labels.sourceChipLabel(value))}
              onRemove={() => onToggleFilterValue("sources", value)}
            />
          ))}
          <button type="button" className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm" onClick={onClearAll}>
            {labels.clearAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
