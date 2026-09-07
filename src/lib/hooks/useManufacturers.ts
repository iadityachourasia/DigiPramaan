"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchManufacturers, fetchManufacturerScorecard } from "@/lib/api/manufacturers";
import type { ManufacturerScorecard } from "@/types";

/*
 * The `?demo=` states are derived, never written into state by an effect.
 * Writing them synchronously inside the effect is what triggers
 * `react-hooks/set-state-in-effect` (the same trap `useRecordsList`'s
 * `loading` fell into), and deriving them is simply more correct: a demo
 * state is a function of the URL, so it doesn't need to be stored at all.
 */

export function useManufacturers(demoState?: string) {
  const [fetched, setFetched] = useState<ManufacturerScorecard[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  const skipFetch = demoState === "loading" || demoState === "error";

  useEffect(() => {
    if (skipFetch) return;

    let cancelled = false;
    fetchManufacturers().then((result) => {
      if (cancelled) return;
      if (result.ok) setFetched(result.data.scorecards);
      else setFetchFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [skipFetch]);

  if (demoState === "error") {
    return { scorecards: null, loading: false, error: true };
  }
  if (demoState === "loading") {
    return { scorecards: null, loading: true, error: false };
  }
  if (demoState === "empty") {
    return { scorecards: [] as ManufacturerScorecard[], loading: false, error: false };
  }

  return {
    scorecards: fetched,
    loading: !fetched && !fetchFailed,
    error: fetchFailed,
  };
}

/**
 * `?demo=empty` and `?demo=single-scan` reshape the real response rather
 * than substituting a fixture, so both branches are exercised against the
 * same component tree the live path renders.
 */
function applyDemoShape(
  scorecard: ManufacturerScorecard,
  demoState?: string
): ManufacturerScorecard {
  if (demoState === "empty") {
    return {
      ...scorecard,
      summary: { ...scorecard.summary, totalProductsScanned: 0 },
      products: [],
      complianceTrend: [],
      violationBreakdown: [],
    };
  }
  if (demoState === "single-scan") {
    return { ...scorecard, complianceTrend: scorecard.complianceTrend.slice(0, 1) };
  }
  return scorecard;
}

/**
 * useManufacturerScorecard — one manufacturer's scorecard (09 §3).
 * `notFound` is distinct from `error`: an unknown id is a 404 the page
 * renders as "no such manufacturer", not a retryable failure.
 */
export function useManufacturerScorecard(id: string, demoState?: string) {
  const [fetched, setFetched] = useState<ManufacturerScorecard | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const skipFetch = demoState === "loading" || demoState === "error";

  const load = useCallback(() => {
    if (skipFetch) return () => undefined;

    let cancelled = false;
    fetchManufacturerScorecard(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setFetched(result.data);
      else if (result.status === 404) setNotFound(true);
      else setFetchFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, skipFetch]);

  useEffect(load, [load]);

  if (demoState === "error") {
    return { scorecard: null, loading: false, error: true, notFound: false, refetch: load };
  }
  if (demoState === "loading") {
    return { scorecard: null, loading: true, error: false, notFound: false, refetch: load };
  }

  return {
    scorecard: fetched ? applyDemoShape(fetched, demoState) : null,
    loading: !fetched && !fetchFailed && !notFound,
    error: fetchFailed,
    notFound,
    refetch: load,
  };
}
