"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchCase, transitionCase, type CaseDetail, type CaseStatus } from "@/lib/api/cases";

/** useCase — Phase 4, Compliance Follow-Through. Same real-backend-only
 * convention as useProductDna. */
export function useCase(caseId: string) {
  const [fetched, setFetched] = useState<CaseDetail | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchCase(caseId).then((result) => {
      if (cancelled) return;
      if (result.ok) setFetched(result.data);
      else if (result.status === 404) setNotFound(true);
      else setFetchFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  useEffect(load, [load]);

  const transition = useCallback(
    async (toStatus: CaseStatus, note?: string) => {
      setTransitioning(true);
      setTransitionError(null);
      const result = await transitionCase(caseId, toStatus, note);
      setTransitioning(false);
      if (result.ok) {
        setFetched(result.data);
        return true;
      }
      setTransitionError(result.message);
      return false;
    },
    [caseId]
  );

  return {
    caseDetail: fetched,
    loading: !fetched && !fetchFailed && !notFound,
    error: fetchFailed,
    notFound,
    refetch: load,
    transition,
    transitioning,
    transitionError,
  };
}
