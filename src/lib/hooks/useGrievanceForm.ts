"use client";

import { useCallback, useState } from "react";

import { lookupGrievance, submitGrievance } from "@/lib/api/grievances";
import { inspectPhotoQuality } from "@/lib/utils/photoQuality";
import type {
  CaptureSlotState,
  GrievanceConcern,
  GrievanceReceipt,
  GrievanceStatusLookup,
  PhotoQualityHint,
} from "@/types";

/**
 * useGrievanceForm — one photo, optional context, and a submission that has no
 * signed-in user behind it (page 11).
 *
 * NOT `useCaptureSlots`. That hook builds initial state for all four named
 * angles and gates completeness on `MANDATORY_CAPTURE_ANGLES` (front/back),
 * with no option to narrow either. Page 11 takes exactly one photo. More
 * importantly, `useCaptureSlots` routes every image through
 * `checkImageQuality`, whose failure means the photo is rejected — the precise
 * behaviour page 11 §4 forbids.
 *
 * So the photo lands in `passed` whatever the advisory check thinks, and the
 * hint travels alongside it as separate, non-blocking information. The
 * `failed` state is never produced here at all.
 */

/** `CaptureSlot` needs one of the four named angles; "front" is the only sensible one. */
const PHOTO_ANGLE = "front" as const;

export interface UseGrievanceFormResult {
  slot: CaptureSlotState;
  qualityHint: PhotoQualityHint | null;
  attachPhoto: (file: File) => Promise<void>;
  removePhoto: () => void;
  concerns: GrievanceConcern[];
  toggleConcern: (concern: GrievanceConcern) => void;
  fields: GrievanceFields;
  setField: (key: keyof GrievanceFields, value: string) => void;
  submitting: boolean;
  submitError: boolean;
  missingPhoto: boolean;
  receipt: GrievanceReceipt | null;
  submit: () => Promise<void>;
}

export interface GrievanceFields {
  concernNote: string;
  shopNameOrLocation: string;
  submitterName: string;
  submitterContact: string;
  /** Honeypot, rendered hidden. A real person never sees or fills this. */
  website: string;
}

const EMPTY_FIELDS: GrievanceFields = {
  concernNote: "",
  shopNameOrLocation: "",
  submitterName: "",
  submitterContact: "",
  website: "",
};

export function useGrievanceForm(demoState?: string): UseGrievanceFormResult {
  const [slot, setSlot] = useState<CaptureSlotState>({
    angle: PHOTO_ANGLE,
    status: "empty",
  });
  const [file, setFile] = useState<File | null>(null);
  const [qualityHint, setQualityHint] = useState<PhotoQualityHint | null>(null);
  const [concerns, setConcerns] = useState<GrievanceConcern[]>([]);
  const [fields, setFields] = useState<GrievanceFields>(EMPTY_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [missingPhoto, setMissingPhoto] = useState(false);
  const [receipt, setReceipt] = useState<GrievanceReceipt | null>(null);

  const attachPhoto = useCallback(
    async (selected: File) => {
      setSlot({ angle: PHOTO_ANGLE, status: "checking" });
      setMissingPhoto(false);

      /*
       * `?demo=quality-blurry` / `?demo=quality-dark` force the advisory so the
       * state is demonstrable without hunting for a bad photo. Unlike page 3's
       * gate, the real check below genuinely inspects the image, so this is a
       * convenience rather than the only way to reach the state.
       */
      const forced =
        demoState === "quality-blurry"
          ? ({ isLikelyPoorQuality: true, reason: "blurry" } as const)
          : demoState === "quality-dark"
            ? ({ isLikelyPoorQuality: true, reason: "dark" } as const)
            : null;

      const hint = forced ?? (await inspectPhotoQuality(selected));

      setFile(selected);
      setQualityHint(hint.isLikelyPoorQuality ? hint : null);
      /* Always `passed`. A poor photo is accepted with a note beside it. */
      setSlot({
        angle: PHOTO_ANGLE,
        status: "passed",
        image: {
          id: `grievance-photo-${Date.now()}`,
          fileName: selected.name,
          url: URL.createObjectURL(selected),
          sizeBytes: selected.size,
          angle: PHOTO_ANGLE,
          altText: "The label photograph you attached",
        },
      });
    },
    [demoState]
  );

  const removePhoto = useCallback(() => {
    setSlot({ angle: PHOTO_ANGLE, status: "empty" });
    setFile(null);
    setQualityHint(null);
  }, []);

  const toggleConcern = useCallback((concern: GrievanceConcern) => {
    setConcerns((prev) =>
      prev.includes(concern) ? prev.filter((entry) => entry !== concern) : [...prev, concern]
    );
  }, []);

  const setField = useCallback((key: keyof GrievanceFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (!file || slot.status !== "passed" || !slot.image) {
      setMissingPhoto(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(false);

    if (demoState === "submit-error") {
      setSubmitting(false);
      setSubmitError(true);
      return;
    }

    const result = await submitGrievance({
      photo: {
        fileName: slot.image.fileName,
        url: slot.image.url,
        sizeBytes: slot.image.sizeBytes,
      },
      concerns,
      ...(fields.concernNote.trim() ? { concernNote: fields.concernNote.trim() } : {}),
      ...(fields.shopNameOrLocation.trim()
        ? { shopNameOrLocation: fields.shopNameOrLocation.trim() }
        : {}),
      ...(fields.submitterName.trim() ? { submitterName: fields.submitterName.trim() } : {}),
      ...(fields.submitterContact.trim()
        ? { submitterContact: fields.submitterContact.trim() }
        : {}),
      ...(qualityHint?.reason
        ? { qualityNote: `Submitted from the public portal — the photo looked ${qualityHint.reason}.` }
        : {}),
      ...(fields.website ? { website: fields.website } : {}),
    });

    setSubmitting(false);

    if (!result.ok) {
      /*
       * The photo and every typed field are deliberately left untouched. Page
       * 11 §4 is explicit that a failed submission must not cost the citizen
       * their photograph.
       */
      setSubmitError(true);
      return;
    }

    setReceipt(result.data);
  }, [file, slot, concerns, fields, qualityHint, demoState]);

  return {
    slot,
    qualityHint,
    attachPhoto,
    removePhoto,
    concerns,
    toggleConcern,
    fields,
    setField,
    submitting,
    submitError,
    missingPhoto,
    receipt,
    submit,
  };
}

/* ------------------------------------------------------------------ *
 * Status lookup
 * ------------------------------------------------------------------ */

export interface UseGrievanceLookupResult {
  result: GrievanceStatusLookup | null;
  notFound: boolean;
  searching: boolean;
  search: (reference: string) => Promise<void>;
  reset: () => void;
}

export function useGrievanceLookup(): UseGrievanceLookupResult {
  const [result, setResult] = useState<GrievanceStatusLookup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (reference: string) => {
    if (!reference.trim()) return;
    setSearching(true);
    setNotFound(false);
    setResult(null);

    const lookup = await lookupGrievance(reference.trim());
    setSearching(false);

    if (lookup.ok) setResult(lookup.data);
    else setNotFound(true);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setNotFound(false);
  }, []);

  return { result, notFound, searching, search, reset };
}
