"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Pagination } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/Select";
import { Link, useRouter } from "@/i18n/navigation";
import {
  archiveRecord as archiveRecordRequest,
  bulkSetNeedsReview as bulkSetNeedsReviewRequest,
} from "@/lib/api/records";
import { ROUTES } from "@/lib/constants";
import { MULTI_FILTER_KEYS, useAuth, useRecordsList, usePermission } from "@/lib/hooks";
import { INSPECTION_REGIONS, MOCK_MANUFACTURERS } from "@/lib/mock";
import {
  COMPLIANCE_STATUSES,
  PRODUCT_CATEGORIES,
  SOURCE_TAGS,
  VIOLATION_TAXONOMY,
  violationCategory,
  type ComplianceRecord,
  type RecordFilters,
  type RecordSort,
  type ViolationCategoryId,
} from "@/types";

import { RecordsFilters } from "./RecordsFilters";
import { RecordsTable } from "./RecordsTable";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function downloadCsv(records: readonly ComplianceRecord[]) {
  const header = ["Product", "Manufacturer", "Compliance Status", "Scan Date", "Source"];
  const rows = records.map((r) => [
    r.productName,
    r.manufacturerName,
    r.complianceStatus,
    r.scannedAt,
    r.source,
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "compliance-records.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The Reports page (page 10) link for the *current filter set*.
 *
 * Deliberately not part of the bulk bar. The bulk bar is selection-scoped,
 * and `ReportScope` has no "these specific record ids" variant — a filter set
 * is reproducible when the report is re-downloaded months later, while a
 * transient row selection is not. So this reports on what is filtered, and
 * says so.
 *
 * Serialised with the same repeated-key convention `useRecordsList` reads
 * back (`?regions=A&regions=B`), so the two stay in step by construction
 * rather than by a second format kept in sync by hand.
 */
function reportHref(filters: RecordFilters): string {
  const params = new URLSearchParams();
  params.set("type", "filtered");
  for (const key of MULTI_FILTER_KEYS) {
    for (const value of filters[key]) params.append(key, value);
  }
  if (filters.query) params.set("query", filters.query);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return `${ROUTES.reports}?${params.toString()}`;
}

/**
 * RecordsView — client orchestrator for Compliance Records (page 5).
 * Filter/sort/page state lives entirely in the URL via `useRecordsList`
 * (05 §3's "arriving pre-filtered" requirement); this component owns only
 * transient, page-local UI state — row selection — plus the row/bulk
 * mutation handlers.
 */
export function RecordsView({ locale }: { locale: string }) {
  const t = useTranslations("records");
  const tVocab = useTranslations("vocabulary");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { user } = useAuth();
  const canArchive = usePermission("record.archive");
  const canBulk = usePermission("record.bulkStatusChange");

  const {
    filters,
    sort,
    page,
    pageSize,
    hasActiveFilters,
    data,
    loading,
    refetch,
    toggleFilterValue,
    setQuery,
    setDateRange,
    setSort,
    setPage,
    setPageSize,
    clearAll,
  } = useRecordsList();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  /** Count of selected records a bulk action couldn't write to — static seeds have no backing store (see scan-pipeline-store.ts). */
  const [skippedCount, setSkippedCount] = useState(0);
  const [archiveError, setArchiveError] = useState(false);

  const records = data?.rows ?? [];

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const allSelected = records.length > 0 && records.every((r) => prev.has(r.id));
      return allSelected ? new Set() : new Set(records.map((r) => r.id));
    });
  }

  async function handleArchive(record: ComplianceRecord) {
    if (!user) return;
    /* Archiving now records who did it, so the action needs the signed-in
     * user the same way the bulk actions already did. */
    const result = await archiveRecordRequest(record.id, user.id);
    if (result.ok) {
      setArchiveError(false);
      refetch();
    } else {
      setArchiveError(true);
    }
  }

  function handleReScan(record: ComplianceRecord) {
    const params = new URLSearchParams({ category: record.category });
    if (record.manufacturerName) params.set("manufacturer", record.manufacturerName);
    if (record.region) params.set("region", record.region);
    router.push(`${ROUTES.scan}?${params.toString()}`);
  }

  function handleGenerateReport(record: ComplianceRecord) {
    router.push(`${ROUTES.reports}?recordId=${encodeURIComponent(record.id)}`);
  }

  async function handleBulkExport() {
    downloadCsv(records.filter((r) => selectedIds.has(r.id)));
  }

  async function handleBulkNeedsReview(flag: boolean) {
    if (!user || selectedIds.size === 0) return;
    setBulkPending(true);
    const result = await bulkSetNeedsReviewRequest([...selectedIds], user.id, flag);
    setBulkPending(false);
    if (result.ok) {
      setSkippedCount(result.data.skipped.length);
      setSelectedIds(new Set());
      refetch();
    }
  }

  const totalCount = data?.totalCount ?? 0;
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="lmcs-page-section">
      <RecordsFilters
        filters={filters}
        sort={sort}
        hasActiveFilters={hasActiveFilters}
        onToggleFilterValue={toggleFilterValue}
        onSetQuery={setQuery}
        onSetDateRange={setDateRange}
        onSetSort={setSort}
        onClearAll={clearAll}
        options={{
          categories: PRODUCT_CATEGORIES.map((c) => ({ label: c, value: c })),
          complianceStatuses: COMPLIANCE_STATUSES.map((s) => ({
            label: tVocab(`complianceStatus.${s}`),
            value: s,
          })),
          regions: INSPECTION_REGIONS.map((r) => ({ label: r, value: r })),
          manufacturers: MOCK_MANUFACTURERS.map((m) => ({ label: m.name, value: m.name })),
          sources: SOURCE_TAGS.map((s) => ({ label: tVocab(`sourceTag.${s}`), value: s })),
          violationCategories: VIOLATION_TAXONOMY.map((v) => ({ label: v.category, value: v.id })),
        }}
        labels={{
          searchLabel: t("filters.searchLabel"),
          searchPlaceholder: t("filters.searchPlaceholder"),
          categoryLabel: t("filters.categoryLabel"),
          statusLabel: t("filters.statusLabel"),
          regionLabel: t("filters.regionLabel"),
          manufacturerLabel: t("filters.manufacturerLabel"),
          sourceLabel: t("filters.sourceLabel"),
          violationLabel: t("filters.violationLabel"),
          dateFromLabel: t("filters.dateFromLabel"),
          dateToLabel: t("filters.dateToLabel"),
          sortLabel: t("filters.sortLabel"),
          sortOptions: {
            newest: t("filters.sortOptions.newest"),
            oldest: t("filters.sortOptions.oldest"),
            alphabetical: t("filters.sortOptions.alphabetical"),
            status: t("filters.sortOptions.status"),
            relevance: t("filters.sortOptions.relevance"),
          } satisfies Record<RecordSort, string>,
          clearAll: t("filters.clearAll"),
          removeFilter: (label) => t("filters.removeFilter", { label }),
          addFilterPlaceholder: t("filters.addFilterPlaceholder"),
          categoryChipLabel: (value) => t("filters.chip.category", { value }),
          statusChipLabel: (value) =>
            t("filters.chip.status", { value: tVocab(`complianceStatus.${value}`) }),
          regionChipLabel: (value) => t("filters.chip.region", { value }),
          manufacturerChipLabel: (value) => t("filters.chip.manufacturer", { value }),
          sourceChipLabel: (value) =>
            t("filters.chip.source", { value: tVocab(`sourceTag.${value}`) }),
          violationChipLabel: (value) =>
            t("filters.chip.violation", {
              value: violationCategory(value as ViolationCategoryId).category,
            }),
          batchChipLabel: (value) => t("filters.chip.batch", { value }),
          queryChipLabel: (value) => t("filters.chip.query", { value }),
          dateFromChipLabel: (value) => t("filters.chip.dateFrom", { value }),
          dateToChipLabel: (value) => t("filters.chip.dateTo", { value }),
        }}
      />

      {archiveError ? (
        <Alert severity="error" title={t("mutationError.title")}>
          {t("mutationError.body")}
        </Alert>
      ) : null}

      {skippedCount > 0 ? (
        <Alert severity="warning" title={t("bulk.skippedTitle")}>
          {t("bulk.skippedBody", { count: skippedCount })}
        </Alert>
      ) : null}

      {/*
        Filter-scoped, so it sits with the filters rather than in the
        selection bar below.
      */}
      <div className="lmcs-records-toolbar">
        <Link href={reportHref(filters)} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
          <span className="ux4g-icon-outlined" aria-hidden="true">
            summarize
          </span>
          {t("generateReportFromFilters")}
        </Link>
      </div>

      {canBulk ? (
        <div className="lmcs-records-bulk-bar">
          <span className="ux4g-body-s-default">
            {t("bulk.selectedCount", { count: selectedIds.size })}
          </span>
          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
            disabled={selectedIds.size === 0 || bulkPending}
            onClick={handleBulkExport}
          >
            {t("bulk.export")}
          </button>
          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
            disabled={selectedIds.size === 0 || bulkPending}
            onClick={() => handleBulkNeedsReview(true)}
          >
            {t("bulk.flagNeedsReview")}
          </button>
          <button
            type="button"
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
            disabled={selectedIds.size === 0 || bulkPending}
            onClick={() => handleBulkNeedsReview(false)}
          >
            {t("bulk.clearNeedsReview")}
          </button>
        </div>
      ) : null}

      <RecordsTable
        records={records}
        loading={loading}
        hasActiveFilters={hasActiveFilters}
        selectedIds={selectedIds}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        showSelection={canBulk}
        canArchive={canArchive}
        onArchive={handleArchive}
        onReScan={handleReScan}
        onGenerateReport={handleGenerateReport}
        locale={locale}
        onClearFilters={clearAll}
        labels={{
          columnThumbnail: t("table.columnThumbnail"),
          columnProduct: t("table.columnProduct"),
          columnManufacturer: t("table.columnManufacturer"),
          columnScanDate: t("table.columnScanDate"),
          columnStatus: t("table.columnStatus"),
          columnViolations: t("table.columnViolations"),
          columnSource: t("table.columnSource"),
          columnLastUpdated: t("table.columnLastUpdated"),
          columnActions: t("table.columnActions"),
          caption: t("table.caption"),
          view: t("table.view"),
          reScan: t("table.reScan"),
          generateReport: t("table.generateReport"),
          archive: t("table.archive"),
          selectAll: t("table.selectAll"),
          selectRow: (productName) => t("table.selectRow", { productName }),
          emptyFilteredTitle: t("table.emptyFilteredTitle"),
          emptyFilteredBody: t("table.emptyFilteredBody"),
          clearFilters: t("filters.clearAll"),
          emptyTitle: t("table.emptyTitle"),
          emptyBody: t("table.emptyBody"),
          emptyAction: t("table.emptyAction"),
          statusLabels: {
            Pending: tVocab("complianceStatus.Pending"),
            Compliant: tVocab("complianceStatus.Compliant"),
            "Non-Compliant": tVocab("complianceStatus.Non-Compliant"),
            "Needs Review": tVocab("complianceStatus.Needs Review"),
            "Not Applicable": tVocab("complianceStatus.Not Applicable"),
          },
          sourceLabels: {
            "Officer-Scanned": tVocab("sourceTag.Officer-Scanned"),
            "Citizen-Reported": tVocab("sourceTag.Citizen-Reported"),
            "E-commerce-Sourced": tVocab("sourceTag.E-commerce-Sourced"),
          },
        }}
      />

      {!loading && totalCount > 0 ? (
        <div className="lmcs-records-pagination-row">
          <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {tCommon("showingResults", { from, to, total: totalCount })}
          </span>
          <Select
            id="records-page-size"
            label={t("pagination.pageSizeLabel")}
            value={String(pageSize)}
            options={PAGE_SIZE_OPTIONS.map((size) => ({ label: String(size), value: String(size) }))}
            onChange={(event) => setPageSize(Number(event.target.value))}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
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
