"use client";

import { useEffect, useState } from "react";

import { fetchAnalyticsData } from "@/lib/api/analytics";
import type { AnalyticsData } from "@/types";

import { useAuth } from "./useAuth";

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
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    /* Scopes the fetch to the signed-in user's jurisdiction and role
     * (13 §4 plan) — see fetchAnalyticsData's own doc comment. */
    fetchAnalyticsData(user?.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { data, loading: !data && !error, error };
}
