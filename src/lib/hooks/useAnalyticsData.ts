"use client";

import { useEffect, useState } from "react";

import { fetchAnalyticsData } from "@/lib/api/analytics";
import type { AnalyticsData } from "@/types";

/**
 * useAnalyticsData — Analytics & Violation Trends' (page 7) one page-level
 * fetch. No filter/period URL state exists for this page (the current
 * stub's "Filters" section is a leftover placeholder, not spec-backed —
 * the only interactive control anywhere on this page is Time Trends' own
 * weekly/monthly toggle, which is synchronous local data selection, not a
 * network call). Each section renders its own loading/error/empty state
 * off the shared `loading`/`error` here, matching Dashboard's own
 * multi-widget-skeleton pattern rather than one page-blocking spinner.
 */
export function useAnalyticsData() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAnalyticsData().then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading: !data && !error, error };
}
