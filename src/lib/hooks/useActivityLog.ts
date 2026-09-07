"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { fetchActivity, type ActivityPageResponse } from "@/lib/api/activity";
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_SORT_OPTIONS,
  type ActivityEventType,
  type ActivityFilters,
  type ActivitySort,
} from "@/types";

/**
 * useActivityLog — the Global Activity Log's filter state and data (13 §3.2).
 *
 * Filter state lives in the URL, not in React state, exactly as
 * `useRecordsList` does — which is what makes "send me the link to what you
 * were looking at" work on an accountability surface where that is a normal
 * thing to ask.
 */

/** The three multi-value dimensions, each carried as a repeated query key. */
export const ACTIVITY_MULTI_KEYS = ["actorUserIds", "types", "regions"] as const;
export type ActivityMultiKey = (typeof ACTIVITY_MULTI_KEYS)[number];

function filtersFromParams(params: URLSearchParams): ActivityFilters {
  const filters: ActivityFilters = {
    actorUserIds: params.getAll("actorUserIds"),
    types: params
      .getAll("types")
      .filter((type): type is ActivityEventType =>
        ACTIVITY_EVENT_TYPES.includes(type as ActivityEventType)
      ),
    regions: params.getAll("regions"),
  };

  const dateFrom = params.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = params.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;
  const recordId = params.get("recordId");
  if (recordId) filters.recordId = recordId;

  return filters;
}

export function useActivityLog(demoState?: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = filtersFromParams(searchParams);

  const sortParam = searchParams.get("sort");
  const sort: ActivitySort = ACTIVITY_SORT_OPTIONS.includes(sortParam as ActivitySort)
    ? (sortParam as ActivitySort)
    : "newest";

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(searchParams.get("pageSize")) || 20);

  const [data, setData] = useState<ActivityPageResponse | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const searchKey = `${searchParams.toString()}::${demoState ?? ""}`;

  /*
   * Demo states are derived from the URL, never written into state by an
   * effect. That is both more correct — a demo state is a function of the URL,
   * so storing it invites drift — and what keeps
   * `react-hooks/set-state-in-effect` satisfied. Same shape the manufacturer
   * and report hooks already use.
   */
  const skipFetch = demoState === "loading" || demoState === "error";

  useEffect(() => {
    if (skipFetch) return;

    let cancelled = false;
    fetchActivity(filters, sort, page, pageSize).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setResolvedKey(searchKey);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `searchKey` is the real, primitive dependency; `filters` is a fresh object every render.
  }, [searchKey, skipFetch]);

  /* Derived, not stored. `?demo=empty` reshapes the real response rather than
   * substituting a fixture, so the empty branch is exercised against the same
   * component tree the live path renders. */
  const resolved =
    demoState === "empty" && data ? { ...data, rows: [], totalCount: 0 } : data;
  const loading = demoState === "loading" || (!failed && resolvedKey !== searchKey);
  const error = demoState === "error" || failed;

  function replace(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, {
      scroll: false,
    });
  }

  function toggleFilterValue(key: ActivityMultiKey, value: string) {
    replace((params) => {
      const current = params.getAll(key);
      params.delete(key);
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      for (const entry of next) params.append(key, entry);
      /* Any filter change invalidates the current page number. */
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

  function setSort(next: ActivitySort) {
    replace((params) => params.set("sort", next));
  }

  function setPage(next: number) {
    replace((params) => params.set("page", String(next)));
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
    ACTIVITY_MULTI_KEYS.some((key) => filters[key].length > 0) ||
    Boolean(filters.dateFrom || filters.dateTo || filters.recordId);

  return {
    filters,
    sort,
    page,
    pageSize,
    hasActiveFilters,
    data: resolved,
    loading,
    error,
    availableRegions: data?.availableRegions ?? [],
    toggleFilterValue,
    setDateRange,
    setSort,
    setPage,
    setPageSize,
    clearAll,
  };
}
