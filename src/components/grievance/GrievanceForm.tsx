"use client";

import { useTranslations } from "next-intl";

import { CaptureSlot } from "@/components/scan/CaptureSlot";
import { Alert } from "@/components/ui/Alert";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import type { UseGrievanceFormResult } from "@/lib/hooks";
import { ACCEPTED_UPLOAD_FORMATS, GRIEVANCE_CONCERNS, type GrievanceConcern } from "@/types";

/**
 * GrievanceForm — the citizen submission form (page 11 §2).
 *
 * ANONYMOUS HAS TO READ AS LEGITIMATE, WHICH IS A SET OF CONCRETE CHOICES
 * -----------------------------------------------------------------------
 * 11 §5: "Anonymous submission should feel equally legitimate as a submission
 * with contact info — don't design it as a lesser/incomplete path." That is
 * only real if it changes what gets built:
 *
 *   - No progress indicator, step counter, or filled-field count anywhere.
 *     There is nothing to complete: one field is required and it is the photo.
 *   - "Optional" is said once, over the whole context group, never repeated as
 *     a suffix on each field. Repeated "(optional)" labels stack up into a
 *     nagging sense of an unfinished form.
 *   - No confirm-step nudge, no warning icon beside the empty contact fields,
 *     and no styling that dims or de-emphasises anything left blank.
 *   - The submit button label never changes with how much has been filled in.
 *
 * THE PHOTO NEVER FAILS
 * ----------------------
 * `CaptureSlot` is reused exactly as page 3 uses it, with one deliberate
 * exception: its `failed` status is never produced here. That status renders
 * the error treatment and hides the image, which would contradict 11 §4's
 * "does not block submission" outright. A poor photo lands in `passed` with an
 * advisory beside it.
 */

const ACCEPT = ACCEPTED_UPLOAD_FORMATS.map((format) =>
  format === "PDF" ? "application/pdf" : `image/${format.toLowerCase()}`
).join(",");

export interface GrievanceFormProps {
  form: UseGrievanceFormResult;
}

export function GrievanceForm({ form }: GrievanceFormProps) {
  const t = useTranslations("grievance");

  return (
    <form
      className="lmcs-grievance-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.submit();
      }}
    >
      {/* The one required field. */}
      <section aria-labelledby="grievance-photo-heading" className="lmcs-page-section-block">
        <h3 id="grievance-photo-heading" className="ux4g-title-s-strong">
          {t("form.photoHeading")}
        </h3>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">
          {t("form.photoHelp")}
        </p>

        {/*
          `mode="device"`, not `"camera"`, and deliberately. `CaptureSlot`
          renders either the live-camera control or the file input, never both,
          and 11 section 3 needs both paths open: "Citizen photographs the label
          (or uploads an existing photo)". The file input is the one that keeps
          them open — a phone file picker offers Take Photo alongside the photo
          library, so camera capture is still one tap away, while a desktop
          visitor and anyone who has denied camera access can still take part.
          The camera-only mode would have shut both of those out.
        */}
        <CaptureSlot
          mode="device"
          state={form.slot}
          accept={ACCEPT}
          onFileSelected={(file) => void form.attachPhoto(file)}
          onRetake={form.removePhoto}
          labels={{
            label: t("form.photoLabel"),
            hint: t("form.photoHint"),
            empty: t("form.photoEmpty"),
            browse: t("form.photoBrowse"),
            takePhoto: t("form.photoTake"),
            retake: t("form.photoRetake"),
            remove: t("form.photoRemove"),
            checking: t("form.photoChecking"),
            passed: t("form.photoAttached"),
            formatHint: t("form.photoFormatHint"),
            cameraDenied: t("form.cameraDenied"),
            /* Never reached: this page never produces the failed status. */
            failureReason: () => t("form.photoFormatHint"),
          }}
        />

        {/*
          Advisory, not a rejection. It sits beside a photo that has already
          been accepted, and submitting with it showing is a supported outcome.
        */}
        {form.qualityHint?.reason ? (
          <Alert severity="info" title={t(`quality.${form.qualityHint.reason}Title`)}>
            {t(`quality.${form.qualityHint.reason}Body`)}
          </Alert>
        ) : null}

        {form.missingPhoto ? (
          <Alert severity="error" title={t("form.photoRequiredTitle")}>
            {t("form.photoRequiredBody")}
          </Alert>
        ) : null}
      </section>

      {/*
        Everything below is optional, and the heading says so once for the whole
        group rather than each field repeating it.
      */}
      <section aria-labelledby="grievance-context-heading" className="lmcs-page-section-block">
        <h3 id="grievance-context-heading" className="ux4g-title-s-strong">
          {t("form.contextHeading")}
        </h3>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">
          {t("form.contextHelp")}
        </p>

        <fieldset className="lmcs-grievance-concerns">
          <legend className="ux4g-label-l-default">{t("form.concernsLegend")}</legend>
          {GRIEVANCE_CONCERNS.map((concern: GrievanceConcern) => (
            <Checkbox
              key={concern}
              id={`grievance-concern-${concern}`}
              label={t(`concerns.${concern}`)}
              checked={form.concerns.includes(concern)}
              onChange={() => form.toggleConcern(concern)}
            />
          ))}
        </fieldset>

        <TextField
          id="grievance-concern-note"
          label={t("form.noteLabel")}
          hint={t("form.noteHint")}
          value={form.fields.concernNote}
          onChange={(event) => form.setField("concernNote", event.target.value)}
        />

        <TextField
          id="grievance-shop"
          label={t("form.shopLabel")}
          hint={t("form.shopHint")}
          value={form.fields.shopNameOrLocation}
          onChange={(event) => form.setField("shopNameOrLocation", event.target.value)}
        />

        <TextField
          id="grievance-name"
          label={t("form.nameLabel")}
          value={form.fields.submitterName}
          onChange={(event) => form.setField("submitterName", event.target.value)}
        />

        <TextField
          id="grievance-contact"
          label={t("form.contactLabel")}
          hint={t("form.contactHint")}
          value={form.fields.submitterContact}
          onChange={(event) => form.setField("submitterContact", event.target.value)}
        />

        {/*
          Honeypot. Hidden from people and from assistive technology, so anyone
          who fills it is automated. `hidden` rather than off-screen positioning
          — a screen reader user should never land on it at all.
        */}
        <input
          type="text"
          name="website"
          hidden
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={form.fields.website}
          onChange={(event) => form.setField("website", event.target.value)}
        />
      </section>

      {form.submitError ? (
        <Alert severity="error" title={t("form.submitErrorTitle")}>
          {t("form.submitErrorBody")}
        </Alert>
      ) : null}

      <div className="lmcs-grievance-actions">
        {/* One label, always. It never reports how complete the form is. */}
        <button
          type="submit"
          className="ux4g-btn ux4g-btn-primary ux4g-btn-lg"
          disabled={form.submitting}
        >
          {form.submitting ? t("form.submitting") : t("form.submit")}
        </button>
      </div>
    </form>
  );
}
