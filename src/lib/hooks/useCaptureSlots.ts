"use client";

import { useCallback, useReducer } from "react";

import { checkImageQuality } from "@/lib/api/scans";
import type { CaptureSlotAngle, CaptureSlotState, QualityFailureReason } from "@/types";
import { CAPTURE_SLOT_ANGLES } from "@/types";

/**
 * useCaptureSlots — client-side state for the three (+1) named capture slots.
 *
 * 03-scan-upload.md §2 is explicit that a slot's state is independent: rejecting
 * the Back image never discards an already-accepted Front image, and "a prior
 * failed attempt leaves no trace in the active UI once a later attempt passes."
 * A `useReducer` keyed by angle models exactly that — each action only ever
 * touches its own slot, and a FAIL action's payload is overwritten (not
 * appended to any list) the moment a later attempt for that same slot resolves.
 *
 * This hook owns orchestration (calling the quality-check API) as well as
 * state, rather than splitting "what happened" from "how it happened" across
 * two files — there is exactly one caller (the wizard page) and one shape of
 * interaction (submit an image, wait, land on passed or failed).
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
        [action.angle]: { angle: action.angle, status: "passed", image: action.image },
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

  const submitImage = useCallback(
    async (angle: CaptureSlotAngle, file: File) => {
      dispatch({ type: "CHECKING", angle });

      const result = await checkImageQuality({ angle, file }, options.simulateFailure);

      if (!result.ok) {
        dispatch({ type: "FAILED", angle, reason: "no_text_detected" });
        return;
      }

      if (!result.data.passed) {
        dispatch({ type: "FAILED", angle, reason: result.data.failureReason ?? "no_text_detected" });
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
    },
    [options.simulateFailure]
  );

  const startCapture = useCallback((angle: CaptureSlotAngle) => {
    dispatch({ type: "CAPTURING", angle });
  }, []);

  const retake = useCallback((angle: CaptureSlotAngle) => {
    dispatch({ type: "RESET", angle });
  }, []);

  const requiredAnglesFilled = (["front", "back", "side_pdp"] as const).every(
    (angle) => slots[angle].status === "passed"
  );

  return { slots, submitImage, startCapture, retake, requiredAnglesFilled };
}
