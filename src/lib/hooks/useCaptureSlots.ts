"use client";

import { useCallback, useReducer, useRef, useState } from "react";

import { isMockMode } from "@/lib/api/client";
import { checkImageQuality, createScanDraft, uploadCaptureImage } from "@/lib/api/scans";
import type { AcceptanceState, CaptureSlotAngle, CaptureSlotState, QualityFailureReason } from "@/types";
import { CAPTURE_SLOT_ANGLES, MANDATORY_CAPTURE_ANGLES } from "@/types";

/**
 * useCaptureSlots — client-side state for the four named capture slots
 * (front/back mandatory, side_pdp/additional optional).
 *
 * 03-scan-upload.md §2 is explicit that a slot's state is independent: rejecting
 * the Back image never discards an already-accepted Front image, and "a prior
 * failed attempt leaves no trace in the active UI once a later attempt passes."
 * A `useReducer` keyed by angle models exactly that — each action only ever
 * touches its own slot, and a FAIL action's payload is overwritten (not
 * appended to any list) the moment a later attempt for that same slot resolves.
 *
 * This hook owns orchestration as well as state. In REAL mode (OP-Phase 1),
 * that orchestration is upload-once intake: the first accepted image lazily
 * creates a scan draft (`createScanDraft`), and every subsequent image
 * uploads directly to it (`uploadCaptureImage`) — one network request per
 * accepted photo, with the backend's quality verdict authoritative from
 * that single call. MOCK mode is unchanged: `checkImageQuality` + an
 * object URL, no draft, no real upload (ScanWizard's own `createScan`
 * still does the mock pipeline creation at submit time).
 */

const INITIAL_SLOTS: Record<CaptureSlotAngle, CaptureSlotState> = Object.fromEntries(
  CAPTURE_SLOT_ANGLES.map((angle) => [angle, { angle, status: "empty" as const }])
) as Record<CaptureSlotAngle, CaptureSlotState>;

type Action =
  | { type: "CAPTURING"; angle: CaptureSlotAngle }
  | { type: "CHECKING"; angle: CaptureSlotAngle }
  | {
      type: "PASSED";
      angle: CaptureSlotAngle;
      image: NonNullable<CaptureSlotState["image"]>;
      acceptanceState?: AcceptanceState;
    }
  | { type: "FAILED"; angle: CaptureSlotAngle; reason: QualityFailureReason }
  | { type: "RESET"; angle: CaptureSlotAngle };

function reducer(
  state: Record<CaptureSlotAngle, CaptureSlotState>,
  action: Action
): Record<CaptureSlotAngle, CaptureSlotState> {
  switch (action.type) {
    case "CAPTURING":
      return { ...state, [action.angle]: { angle: action.angle, status: "capturing" } };
    case "CHECKING":
      return { ...state, [action.angle]: { angle: action.angle, status: "checking" } };
    case "PASSED":
      return {
        ...state,
        [action.angle]: {
          angle: action.angle,
          // A REVIEW-quality (PASS_WITH_WARNINGS) photo is already
          // persisted and counts toward wizard completion — "review" only
          // changes how CaptureSlot renders it (a warning banner), never
          // whether the slot is filled.
          status: action.acceptanceState === "PASS_WITH_WARNINGS" ? "review" : "passed",
          image: action.image,
          ...(action.acceptanceState ? { acceptanceState: action.acceptanceState } : {}),
        },
      };
    case "FAILED":
      return {
        ...state,
        [action.angle]: { angle: action.angle, status: "failed", failureReason: action.reason },
      };
    case "RESET":
      return { ...state, [action.angle]: { angle: action.angle, status: "empty" } };
    default:
      return state;
  }
}

export interface UseCaptureSlotsOptions {
  /** Forces every quality check to resolve with this reason — for demoing. */
  simulateFailure?: QualityFailureReason;
}

export function useCaptureSlots(options: UseCaptureSlotsOptions = {}) {
  const [slots, dispatch] = useReducer(reducer, INITIAL_SLOTS);

  /*
   * The real-mode scan draft id, created lazily on the FIRST accepted (or
   * even attempted) image so a wizard the officer abandons before
   * capturing anything never creates an orphan draft.
   *
   * Tracked in BOTH a ref and state, deliberately: `ensureDraft` below can
   * be called twice in quick succession (front and back captured back to
   * back, before a re-render lands) — reading state there would race and
   * create two drafts, so the ref is the synchronous source of truth for
   * that check-then-create logic. React's rules-of-hooks forbid reading a
   * ref during render, though, so `draftScanId` (returned to the caller)
   * is the state copy, kept in lockstep with the ref whenever it changes.
   */
  const scanDraftIdRef = useRef<string | null>(null);
  const [draftScanId, setDraftScanId] = useState<string | null>(null);
  // A failed (RECAPTURE_REQUIRED) attempt's file, retained per angle so
  // Override can resubmit the SAME bytes with a reason — never re-picked
  // by the officer. Cleared on RESET (retake) or once superseded by a
  // later attempt for that angle.
  const lastFailedFileRef = useRef<Partial<Record<CaptureSlotAngle, File>>>({});

  const ensureDraft = useCallback(async (): Promise<string | null> => {
    if (scanDraftIdRef.current) return scanDraftIdRef.current;
    const result = await createScanDraft();
    if (!result.ok) return null;
    scanDraftIdRef.current = result.data.scanId;
    setDraftScanId(result.data.scanId);
    return result.data.scanId;
  }, []);

  const submitImage = useCallback(
    async (angle: CaptureSlotAngle, file: File) => {
      dispatch({ type: "CHECKING", angle });

      if (isMockMode()) {
        const result = await checkImageQuality({ angle, file }, options.simulateFailure);

        if (!result.ok || !result.data.passed) {
          dispatch({
            type: "FAILED",
            angle,
            reason: result.ok ? (result.data.failureReason ?? "no_text_detected") : "no_text_detected",
          });
          return;
        }

        const objectUrl = URL.createObjectURL(file);
        dispatch({
          type: "PASSED",
          angle,
          image: {
            id: `${angle}-${Date.now()}`,
            fileName: file.name,
            url: objectUrl,
            sizeBytes: file.size,
            angle,
            altText: `${angle} label photograph`,
          },
        });
        return;
      }

      const scanId = await ensureDraft();
      if (!scanId) {
        dispatch({ type: "FAILED", angle, reason: "no_text_detected" });
        return;
      }

      const result = await uploadCaptureImage(scanId, angle, file);
      if (!result.ok) {
        dispatch({ type: "FAILED", angle, reason: "no_text_detected" });
        return;
      }

      if (result.data.acceptanceState === "RECAPTURE_REQUIRED") {
        lastFailedFileRef.current[angle] = file;
        dispatch({ type: "FAILED", angle, reason: result.data.failureReason ?? "no_text_detected" });
        return;
      }

      delete lastFailedFileRef.current[angle];
      const objectUrl = URL.createObjectURL(file);
      dispatch({
        type: "PASSED",
        angle,
        acceptanceState: result.data.acceptanceState,
        image: {
          id: `${angle}-${Date.now()}`,
          fileName: file.name,
          url: objectUrl,
          sizeBytes: file.size,
          angle,
          altText: `${angle} label photograph`,
        },
      });
    },
    [options.simulateFailure, ensureDraft]
  );

  /**
   * Real mode only — resubmits a RECAPTURE_REQUIRED photo with an explicit
   * reason, persisting it as OVERRIDDEN server-side. No-op (returns
   * false) if there is no retained file for this angle (mock mode, or the
   * officer already retook the photo) — CaptureSlot only offers this
   * action when a failed slot's file was actually retained.
   */
  const override = useCallback(
    async (angle: CaptureSlotAngle, reason: string): Promise<boolean> => {
      const file = lastFailedFileRef.current[angle];
      const scanId = scanDraftIdRef.current;
      if (!file || !scanId) return false;

      dispatch({ type: "CHECKING", angle });
      const result = await uploadCaptureImage(scanId, angle, file, reason);
      if (!result.ok || result.data.acceptanceState === "RECAPTURE_REQUIRED") {
        dispatch({ type: "FAILED", angle, reason: result.ok ? (result.data.failureReason ?? "no_text_detected") : "no_text_detected" });
        return false;
      }

      delete lastFailedFileRef.current[angle];
      const objectUrl = URL.createObjectURL(file);
      dispatch({
        type: "PASSED",
        angle,
        acceptanceState: result.data.acceptanceState,
        image: {
          id: `${angle}-${Date.now()}`,
          fileName: file.name,
          url: objectUrl,
          sizeBytes: file.size,
          angle,
          altText: `${angle} label photograph`,
        },
      });
      return true;
    },
    []
  );

  const startCapture = useCallback((angle: CaptureSlotAngle) => {
    dispatch({ type: "CAPTURING", angle });
  }, []);

  const retake = useCallback((angle: CaptureSlotAngle) => {
    delete lastFailedFileRef.current[angle];
    dispatch({ type: "RESET", angle });
  }, []);

  const canOverride = useCallback(
    (angle: CaptureSlotAngle) => Boolean(lastFailedFileRef.current[angle]),
    []
  );

  const requiredAnglesFilled = MANDATORY_CAPTURE_ANGLES.every(
    (angle) => slots[angle].status === "passed" || slots[angle].status === "review"
  );

  return {
    slots,
    submitImage,
    startCapture,
    retake,
    override,
    canOverride,
    requiredAnglesFilled,
    draftScanId,
  };
}
