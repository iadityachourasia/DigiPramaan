"use client";

import { FilterChip } from "@/components/shared";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { INSPECTION_REGIONS, MOCK_MANUFACTURERS } from "@/lib/mock";
import {
  COMPLIANCE_STATUSES,
  PRODUCT_CATEGORIES,
  SOURCE_TAGS,
  type ComplianceStatus,
  type ProductCategory,
  type RecordFilters,
  type ReportScope,
  type SourceTag,
} from "@/types";

/**
 * ReportScopePanel — the Report Builder's scope and filters (10 §2).
 *
 * The four arrival shapes are described in `useReports.ts`. This panel shows
 * whichever one the user landed on and lets them adjust it (10 §3 step 2:
 * "confirms or adjusts the report scope/filters"), so a pre-filled scope is
 * a starting point rather than a lock.
 *
 * The multi-value filters reuse page 5's select-then-chip pattern rather than
 * a new multi-select widget — `Select.tsx`'s own doc comment already flags a
 * real multi-select combobox as a larger undertaking, and this is the
 * established answer to that gap in this codebase.
 *
 * The status filter is labelled "Compliance Status" with the fixed four-value
 * vocabulary, which the spec's Definition of Done calls out specifically as
 * something an unlabeled generic "status" filter gets wrong.
 */

type MultiKey = "categories" | "complianceStatuses" | "regions" | "manufacturers" | "sources";

export interface ReportScopePanelProps {
  scope: ReportScope | null;
  onChangeScope: (scope: ReportScope | null) => void;
  rowCount: number | null;
  /** Server-computed description, e.g. the product or manufacturer name. */
  scopeLabel: string | null;
  labels: {
    heading: string;
    scopeLabel: string;
    scopeRecord: string;
    scopeManufacturer: string;
    scopeFiltered: string;
    scopeNone: string;
    scopeNoneHint: string;
    recordScopeNote: (recordId: string) => string;
    manufacturerScopeNote: (manufacturerId: string) => string;
    changeScope: string;
    rowCount: (count: number) => string;
    filtersHeading: string;
    categoryLabel: string;
    statusLabel: string;
    regionLabel: string;
    manufacturerLabel: string;
    sourceLabel: string;
    dateFromLabel: string;
    dateToLabel: string;
    addValue: string;
    removeValue: (value: string) => string;
    statusOptionLabel: (status: ComplianceStatus) => string;
    sourceOptionLabel: (source: SourceTag) => string;
  };
}

export function ReportScopePanel({
  scope,
  onChangeScope,
  rowCount,
  scopeLabel,
  labels,
}: ReportScopePanelProps) {
  const filters = scope?.kind === "filtered" ? scope.filters : null;

  function updateFilters(next: RecordFilters) {
    onChangeScope({ kind: "filtered", filters: next });
  }

  /*
   * `exactOptionalPropertyTypes` is on, so clearing a date means removing the
   * key rather than assigning `undefined` to it.
   */
  function setDate(key: "dateFrom" | "dateTo", value: string) {
    if (!filters) return;
    const next: RecordFilters = { ...filters };
    if (value) next[key] = value;
    else delete next[key];
    updateFilters(next);
  }

  function addValue(key: MultiKey, value: string) {
    if (!filters || !value) return;
    const current = filters[key] as string[];
    if (current.includes(value)) return;
    updateFilters({ ...filters, [key]: [...current, value] });
  }

  function removeValue(key: MultiKey, value: string) {
    if (!filters) return;
    const current = filters[key] as string[];
    updateFilters({ ...filters, [key]: current.filter((entry) => entry !== value) });
  }

  function renderChips(key: MultiKey, values: readonly string[], label: (v: string) => string) {
    if (values.length === 0) return null;
    return (
      <div className="lmcs-records-filter-chips">
        {values.map((value) => (
          <FilterChip
            key={`${key}-${value}`}
            label={`${label(value)}`}
            removeLabel={labels.removeValue(label(value))}
            onRemove={() => removeValue(key, value)}
          />
        ))}
      </div>
    );
  }

  return (
    <section aria-labelledby="report-scope-heading" className="lmcs-page-section-block">
      <h2 id="report-scope-heading" className="ux4g-title-m-strong">
        {labels.heading}
      </h2>

      {/* What the user arrived with, in words. */}
      <div className="lmcs-report-scope-summary">
        <p className="ux4g-body-m-default">
          <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
            {labels.scopeLabel}:{" "}
          </span>
          {/*
            Prefer the server label ("Ganga Sparkling Lemon 600 ml") over
            echoing the id from the URL. The id form is the fallback for the
            moment before the count request resolves.
          */}
          {scope === null
            ? labels.scopeNone
            : (scopeLabel ??
              (scope.kind === "record"
                ? labels.recordScopeNote(scope.recordId)
                : scope.kind === "manufacturer"
                  ? labels.manufacturerScopeNote(scope.manufacturerId)
                  : labels.scopeFiltered))}
        </p>

        {scope === null ? (
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {labels.scopeNoneHint}
          </p>
        ) : null}

        {rowCount === null ? null : (
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {labels.rowCount(rowCount)}
          </p>
        )}

        {scope?.kind === "filtered" ? null : (
          <button
            type="button"
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
            onClick={() =>
              updateFilters({
                categories: [],
                complianceStatuses: [],
                regions: [],
                manufacturers: [],
                sources: [],
                violationCategoryIds: [],
                batchIds: [],
              })
            }
          >
            {labels.changeScope}
          </button>
        )}
      </div>

      {filters ? (
        <div className="lmcs-records-filters">
          <h3 className="ux4g-label-l-default">{labels.filtersHeading}</h3>

          <div className="lmcs-records-filters-row">
            <Select
              id="report-filter-category"
              label={labels.categoryLabel}
              placeholder={labels.addValue}
              options={PRODUCT_CATEGORIES.map((c) => ({ label: c, value: c }))}
              value=""
              onChange={(event) => addValue("categories", event.target.value)}
            />
            <Select
              id="report-filter-status"
              label={labels.statusLabel}
              placeholder={labels.addValue}
              options={COMPLIANCE_STATUSES.map((s) => ({
                label: labels.statusOptionLabel(s),
                value: s,
              }))}
              value=""
              onChange={(event) => addValue("complianceStatuses", event.target.value)}
            />
            <Select
              id="report-filter-region"
              label={labels.regionLabel}
              placeholder={labels.addValue}
              options={INSPECTION_REGIONS.map((r) => ({ label: r, value: r }))}
              value=""
              onChange={(event) => addValue("regions", event.target.value)}
            />
          </div>

          <div className="lmcs-records-filters-row">
            <Select
              id="report-filter-manufacturer"
              label={labels.manufacturerLabel}
              placeholder={labels.addValue}
              options={MOCK_MANUFACTURERS.map((m) => ({ label: m.name, value: m.name }))}
              value=""
              onChange={(event) => addValue("manufacturers", event.target.value)}
            />
            <Select
              id="report-filter-source"
              label={labels.sourceLabel}
              placeholder={labels.addValue}
              options={SOURCE_TAGS.map((s) => ({
                label: labels.sourceOptionLabel(s),
                value: s,
              }))}
              value=""
              onChange={(event) => addValue("sources", event.target.value)}
            />
          </div>

          <div className="lmcs-records-filters-row">
            <TextField
              id="report-filter-date-from"
              label={labels.dateFromLabel}
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(event) => setDate("dateFrom", event.target.value)}
            />
            <TextField
              id="report-filter-date-to"
              label={labels.dateToLabel}
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(event) => setDate("dateTo", event.target.value)}
            />
          </div>

          {renderChips("categories", filters.categories as ProductCategory[], (v) => v)}
          {renderChips("complianceStatuses", filters.complianceStatuses, (v) =>
            labels.statusOptionLabel(v as ComplianceStatus)
          )}
          {renderChips("regions", filters.regions, (v) => v)}
          {renderChips("manufacturers", filters.manufacturers, (v) => v)}
          {renderChips("sources", filters.sources, (v) =>
            labels.sourceOptionLabel(v as SourceTag)
          )}
        </div>
      ) : null}
    </section>
  );
}
