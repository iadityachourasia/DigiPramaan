"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchRecord,
  flagForEnforcement as flagForEnforcementRequest,
  flagNeedsReview as flagNeedsReviewRequest,
} from "@/lib/api/records";
import type { ComplianceRecord } from "@/types";

/**
 * useRecordDetail — data hook for Product Compliance Detail (page 6).
 *
 * Deliberately separate from `useComplianceRecord` (page 4's hook): that
 * one carries `applyCorrection`/`verify`/`retryOcr`/`blockedFields` — a
 * live-extraction editing surface this read-mostly detail page has no use
 * for. Reusing it here would mean dragging in page-4-specific state for a
 * page that only ever reads the record plus two narrow, page-6-specific
 * mutations (Flag as Needs Review / Flag for Enforcement) — the same
 * "distinct read-only surface, not a forced shared hook" call already made
 * for `ChecklistRow` vs. `FieldRow`.
 */
export function useRecordDetail(id: string) {
  const [record, setRecord] = useState<ComplianceRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRecord(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setRecord(result.data);
      else setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const setNeedsReview = useCallback(
    (userId: string, flag: boolean) => {
      if (!record) return;
      setPending(true);
      flagNeedsReviewRequest(record.id, userId, undefined, flag).then((result) => {
        setPending(false);
        if (result.ok) setRecord(result.data);
        else setMutationError(true);
      });
    },
    [record]
  );

  const flagForEnforcement = useCallback(
    (userId: string) => {
      if (!record) return;
      setPending(true);
      flagForEnforcementRequest(record.id, userId).then((result) => {
        setPending(false);
        if (result.ok) setRecord(result.data);
        else setMutationError(true);
      });
    },
    [record]
  );

  return { record, notFound, pending, mutationError, setNeedsReview, flagForEnforcement };
}
