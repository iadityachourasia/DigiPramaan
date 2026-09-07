"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { fetchRecords } from "@/lib/api/records";
import {
  RECORD_SORT_OPTIONS,
  type ComplianceStatus,
  type ProductCategory,
  type RecordFilters,
  type RecordSort,
  type RecordsPage,
  type SourceTag,
  type ViolationCategoryId,
} from "@/types";

/**
 * The seven multi-value `RecordFilters` fields — each rendered as its own
 * set of chips. `batchIds` is the one with no dropdown behind it: a batch
 * id isn't something a user picks from a list, it's arrived at from a
 * completed e-commerce batch's own link (08 §4 step 6).
 */
export const MULTI_FILTER_KEYS = [
  "categories",
  "complianceStatuses",
  "regions",
  "manufacturers",
  "sources",
  "violationCategoryIds",
  "batchIds",
] as const;
export type MultiFilterKey = (typeof MULTI_FILTER_KEYS)[number];

function filtersFromParams(params: URLSearchParams): RecordFilters {
  const filters: RecordFilters = {
    categories: params.getAll("categories") as ProductCategory[],
    complianceStatuses: params.getAll("complianceStatuses") as ComplianceStatus[],
    regions: params.getAll("regions"),
    manufacturers: params.getAll("manufacturers"),
    sources: params.getAll("sources") as SourceTag[],
    violationCategoryIds: params.getAll("violationCategoryIds") as ViolationCategoryId[],
    batchIds: params.getAll("batchIds"),
  };
  const query = params.get("query");
  if (query) filters.query = query;
  const dateFrom = params.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = params.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;
  return filters;
}

/**
 * useRecordsList — Compliance Records' (page 5) data + filter-state hook.
 *
 * The URL's own query string is the single source of truth for filter
 * state, not React state duplicating it — this is what makes "arriving via
 * a deep link with a pre-applied filter" (05 §3 step 1-2) just work: the
 * very first read of `useSearchParams()` already has the answer, with no
 * separate hydration step. Every mutation below goes through
 * `router.replace(..., { scroll: false })`, a shallow URL update that
 * re-triggers the fetch effect rather than a full navigation.
 */
export function useRecordsList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = filtersFromParams(searchParams);
  const sortParam = searchParams.get("sort");
  const sort: RecordSort = RECORD_SORT_OPTIONS.includes(sortParam as RecordSort)
    ? (sortParam as RecordSort)
    : "newest";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(searchParams.get("pageSize")) || 20);

  const [data, setData] = useState<RecordsPage | null>(null);
  /*
   * `loading` is derived (data belongs to a stale key) rather than its own
   * `useState` toggled synchronously at the top of the effect below — the
   * synchronous-setState-in-a-non-mount-effect shape is exactly what
   * `react-hooks/set-state-in-effect` flags (the same fix already applied
   * elsewhere in this app: derive instead of store).
   */
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  /** Bumped after a mutation (archive, bulk flag) that doesn't change the URL, to force a re-fetch. */
  const [refetchToken, setRefetchToken] = useState(0);

  const searchKey = `${searchParams.toString()}::${refetchToken}`;
  const loading = resolvedKey !== searchKey;

  useEffect(() => {
    let cancelled = false;
    fetchRecords(filters, sort, page, pageSize).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      setResolvedKey(searchKey);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `searchKey` is the real, primitive dependency; filters/sort/page/pageSize are derived from it fresh every render.
  }, [searchKey]);

  function refetch() {
    setRefetchToken((t) => t + 1);
  }

  function replace(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, {
      scroll: false,
    });
  }

  function toggleFilterValue(key: MultiFilterKey, value: string) {
    replace((params) => {
      const current = params.getAll(key);
      params.delete(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of next) params.append(key, v);
      params.delete("page");
    });
  }

  function setQuery(value: string) {
    replace((params) => {
      if (value) params.set("query", value);
      else params.delete("query");
      params.delete("page");
    });
  }

  function setDateRange(dateFrom: string, dateTo: string) {
    replace((params) => {
      if (dateFrom) params.set("dateFrom", dateFrom);
      else params.delete("dateFrom");
      if (dateTo) params.set("dateTo", dateTo);
      else params.delete("dateTo");
      params.delete("page");
    });
  }

  function setSort(next: RecordSort) {
    replace((params) => {
      params.set("sort", next);
    });
  }

  function setPage(next: number) {
    replace((params) => {
      params.set("page", String(next));
    });
  }

  function setPageSize(next: number) {
    replace((params) => {
      params.set("pageSize", String(next));
      params.delete("page");
    });
  }

  function clearAll() {
    router.replace(pathname, { scroll: false });
  }

  const hasActiveFilters =
    MULTI_FILTER_KEYS.some((key) => filters[key].length > 0) ||
    Boolean(filters.query || filters.dateFrom || filters.dateTo);

  return {
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
  };
}
