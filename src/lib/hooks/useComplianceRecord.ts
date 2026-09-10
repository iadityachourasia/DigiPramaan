"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchRecord,
  flagNeedsReview as flagNeedsReviewRequest,
  retryOcr as retryOcrRequest,
  saveCorrection as saveCorrectionRequest,
  verifyRecord as verifyRecordRequest,
} from "@/lib/api/records";
import type { ComplianceRecord, DeclarationFieldId } from "@/types";

/**
 * useComplianceRecord — data hook for Declaration Extraction & Verification
 * (page 4). Wraps the server-authoritative `/api/records/[id]` surface (see
 * scan-pipeline-store.ts) — a correction, Confirm & Verify, or Flag as
 * Needs Review all mutate state a second view of this same record must see
 * consistently, so nothing here is a client-side mock branch.
 */
export function useComplianceRecord(id: string, demoZeroDeclarations?: boolean) {
  const [record, setRecord] = useState<ComplianceRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [blockedFields, setBlockedFields] = useState<DeclarationFieldId[]>([]);
  const [pending, setPending] = useState(false);
  /**
   * Set when a mutation 404s — a static-seed record (one never opened
   * through the pipeline) has no backing store to write to, by design (see
   * the page 4 plan §1). Not a `notFound` (the record still read fine),
   * just "this write didn't take" — surfaced so the officer sees something
   * instead of a silently-ignored click.
   */
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
  }, [id, demoZeroDeclarations]);

  const applyCorrection = useCallback(
    (fieldId: DeclarationFieldId, value: string) => {
      if (!record) return;
      setPending(true);
      saveCorrectionRequest(record.id, fieldId, value).then((result) => {
        setPending(false);
        if (result.ok) setRecord(result.data);
        else setMutationError(true);
      });
    },
    [record]
  );

  /** Resolves `true` only when verification actually succeeded (not blocked). */
  const verify = useCallback(
    async (): Promise<boolean> => {
      if (!record) return false;
      setPending(true);
      const result = await verifyRecordRequest(record.id);
      setPending(false);
      if (!result.ok) {
        setMutationError(true);
        return false;
      }
      setRecord(result.data.record);
      setBlockedFields(result.data.blockedFields);
      return result.data.blockedFields.length === 0;
    },
    [record]
  );

  const flagNeedsReview = useCallback(
    (userId: string, note?: string) => {
      if (!record) return;
      setPending(true);
      flagNeedsReviewRequest(record.id, userId, note).then((result) => {
        setPending(false);
        if (result.ok) setRecord(result.data);
        else setMutationError(true);
      });
    },
    [record]
  );

  /* Takes the actor for the first time — re-extraction discards existing
   * corrections and now says who asked for it. */
  const retryOcr = useCallback(() => {
    if (!record) return;
    setPending(true);
    retryOcrRequest(record.id).then((result) => {
      setPending(false);
      if (result.ok) setRecord(result.data);
      else setMutationError(true);
    });
  }, [record]);

  return {
    record,
    notFound,
    pending,
    blockedFields,
    mutationError,
    applyCorrection,
    verify,
    flagNeedsReview,
    retryOcr,
  };
}
