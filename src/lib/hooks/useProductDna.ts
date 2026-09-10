"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchProductDna, type ProductDna } from "@/lib/api/productDna";

/**
 * useProductDna — Phase 4. Always calls the real backend (no mock
 * equivalent exists for this data) — see productDna.ts's own doc comment.
 * Same fetched/fetchFailed/notFound shape as useManufacturerScorecard, for
 * a consistent loading/error/not-found contract across the app.
 */
export function useProductDna(productId: string) {
  const [fetched, setFetched] = useState<ProductDna | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    fetchProductDna(productId).then((result) => {
      if (cancelled) return;
      if (result.ok) setFetched(result.data);
      else if (result.status === 404) setNotFound(true);
      else setFetchFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(load, [load]);

  return {
    dna: fetched,
    loading: !fetched && !fetchFailed && !notFound,
    error: fetchFailed,
    notFound,
    refetch: load,
  };
}
