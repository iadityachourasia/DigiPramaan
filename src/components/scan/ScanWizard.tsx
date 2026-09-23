"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { EmptyState } from "@/components/shared";
import { useRouter } from "@/i18n/navigation";
import { isMockMode } from "@/lib/api/client";
import { createScan, finalizeMobileHandoff, finalizeScan } from "@/lib/api/scans";
import { ROUTES } from "@/lib/constants";
import { useAuth, useCaptureSlots, useMobileHandoffSession, usePermission } from "@/lib/hooks";
import { PRODUCT_NAME_MAX_LENGTH } from "@/lib/validations/scan";
import {
  CAPTURE_SLOT_ANGLES,
  DEFAULT_MAX_UPLOAD_MB,
  MANDATORY_CAPTURE_ANGLES,
  PIPELINE_STAGE_IDS,
  PRODUCT_CATEGORIES,
  QUALITY_FAILURE_REASONS,
  type CaptureMode,
  type CaptureSlotAngle,
  type QualityFailureReason,
  type ScanMetadata,
} from "@/types";

import { CaptureSlotGrid } from "./CaptureSlotGrid";
import { ManualEntryForm, type ManualEntryValues } from "./ManualEntryForm";
import { MobileHandoffPanel } from "./MobileHandoffPanel";
import { ModeSelectCards } from "./ModeSelectCards";
import { ScanMetadataForm } from "./ScanMetadataForm";
import { WizardProgress } from "./WizardProgress";

const METADATA_FORM_ID = "scan-metadata-form";

/**
 * ScanWizard — the client-side orchestrator for the Scan Capture Wizard.
 *
 * Covers device-upload and live-camera capture, the quality gate, mobile
 * handoff, manual entry, and metadata. The Processing Pipeline Tracker is a
 * separate, later route (03 §2 Step 5) — submitting here just routes to it.
 */
export function ScanWizard() {
  const t = useTranslations("scan");
  const tDeclarationField = useTranslations("declarationField");
  const router = useRouter();
  const searchParams = useSearchParams();
  const canScan = usePermission("scan.create");
  const { user } = useAuth();

  /*
   * A stable per-session identifier scoping the mobile handoff to one scan
   * draft (03 §2). `useId()` rather than `crypto.randomUUID()` in an
   * initializer — it's SSR-safe by design, so there is no hydration
   * mismatch to worry about for a value that would otherwise differ between
   * the server render and the client. The raw value (e.g. ":r0:") is stripped
   * to alphanumerics and prefixed — it's shown to the officer on their phone
   * ("Capturing for scan …"), so it needs to read as an identifier, not a
   * React internal.
   */
  const rawId = useId();
  const scanDraftId = `SCAN-${rawId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`;

  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [manualEntryActive, setManualEntryActive] = useState(false);
  const [manualEntryValues, setManualEntryValues] = useState<ManualEntryValues>({
    isImport: false,
  });
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /*
   * `?demo=quality-blur` etc. forces every quality check in this session to
   * fail with that reason — the established `?demo=` convention from the
   * Dashboard, so every rejection reason is reachable on demand for a demo
   * without a real bad photo. `checkImageQuality`'s mock branch is the only
   * thing that reads this; the real call ignores it entirely.
   */
  const demoParam = searchParams.get("demo");
  const simulateFailure = QUALITY_FAILURE_REASONS.find(
    (reason) => demoParam === `quality-${reason.replace(/_/g, "-")}`
  );

  /*
   * `?demo=pipeline-fail-<stage>` / `?demo=no-fallback` / `?demo=fallback-used`
   * — same convention, forwarded once at submit time into the pipeline run's
   * creation config (see scan-pipeline-store.ts). Read here, not re-read by
   * the tracker's own polling — the run's seeded behaviour is fixed at
   * creation, exactly like a mobile session's config is.
   */
  const forceFailStage = PIPELINE_STAGE_IDS.find(
    (stageId) => demoParam === `pipeline-fail-${stageId.replace(/([A-Z])/g, "-$1").toLowerCase()}`
  );
  const fallbackOverride: "used" | "skipped" | undefined =
    demoParam === "no-fallback" ? "skipped" : demoParam === "fallback-used" ? "used" : undefined;

  /*
   * Compliance Records' "Re-scan" row action (05-compliance-records.md §2)
   * links here with the prior record's category/manufacturer/region as
   * query params — the only fields `ScanMetadata` has to pre-fill with.
   * Read once; the metadata form owns the fields from here on.
   */
  const prefillCategory = searchParams.get("category");
  const metadataDefaults =
    prefillCategory && (PRODUCT_CATEGORIES as readonly string[]).includes(prefillCategory)
      ? {
          category: prefillCategory as ScanMetadata["category"],
          ...(searchParams.get("manufacturer")
            ? { manufacturerName: searchParams.get("manufacturer")! }
            : {}),
          ...(searchParams.get("region") ? { region: searchParams.get("region")! } : {}),
        }
      : undefined;

  const { slots, submitImage, retake, override, canOverride, requiredAnglesFilled, draftScanId } =
    useCaptureSlots({
      ...(simulateFailure ? { simulateFailure } : {}),
    });

  const {
    session: mobileSession,
    regenerate: regenerateMobileSession,
    cancel: cancelMobileSession,
  } = useMobileHandoffSession(scanDraftId, mode === "mobile");

  if (!canScan) {
    return (
      <EmptyState icon="block" title={t("noAccessTitle")} description={t("noAccessBody")} />
    );
  }

  const manualEntryComplete =
    manualEntryActive &&
    Boolean(manualEntryValues.manufacturerDetails) &&
    Boolean(manualEntryValues.genericName) &&
    Boolean(manualEntryValues.netQuantity);

  const mobileCaptureComplete =
    mode === "mobile" &&
    Boolean(mobileSession) &&
    MANDATORY_CAPTURE_ANGLES.every((angle) => mobileSession!.capturedAngles.includes(angle));

  const captureComplete = manualEntryActive
    ? manualEntryComplete
    : mode === "mobile"
      ? mobileCaptureComplete
      : requiredAnglesFilled;

  const progressIndex = submitting ? 3 : mode || manualEntryActive ? (captureComplete ? 2 : 1) : 0;

  async function finishSubmit(metadata: ScanMetadata) {
    setSubmitting(true);

    /*
     * Real mode's mobile path never batches images here — each one was
     * already persisted as a real EvidenceImage the moment the phone
     * uploaded it (see scans.ts's uploadMobileCaptureImage). This step is
     * the officer's own explicit "Continue" click finishing what the
     * phone started: fill in category/region (only just collected, at
     * this Details step) and hand off to the SAME finalize->run_pipeline
     * path device/camera mode's own createScan() already schedules.
     */
    if (mode === "mobile" && mobileSession && !isMockMode()) {
      const finalizeResult = await finalizeMobileHandoff(mobileSession.scanDraftId, metadata);
      setSubmitting(false);
      if (finalizeResult.ok) {
        router.push(ROUTES.scanStatus(finalizeResult.data.id));
      }
      return;
    }

    /*
     * OP-Phase 1 — real mode's device/camera path: every accepted image
     * was already uploaded exactly once as it was captured
     * (useCaptureSlots' own real-mode branch), so finalize here only
     * attaches the Details step's category/region and schedules the
     * pipeline — no re-upload, matching the mobile branch above.
     */
    if (!manualEntryActive && mode !== "mobile" && !isMockMode() && draftScanId) {
      const finalizeResult = await finalizeScan(draftScanId, metadata);
      setSubmitting(false);
      if (finalizeResult.ok) {
        router.push(ROUTES.scanStatus(finalizeResult.data.id));
      }
      return;
    }

    const images =
      mode === "mobile" && mobileSession
        ? CAPTURE_SLOT_ANGLES.filter((angle) => mobileSession.capturedImages[angle]).map((angle) => {
            const image = mobileSession.capturedImages[angle]!;
            return { angle, fileName: image.fileName, url: image.url, sizeBytes: image.sizeBytes };
          })
        : CAPTURE_SLOT_ANGLES.filter(
            (angle) => (slots[angle].status === "passed" || slots[angle].status === "review") && slots[angle].image
          ).map((angle) => {
            const image = slots[angle].image!;
            return { angle, fileName: image.fileName, url: image.url, sizeBytes: image.sizeBytes };
          });

    const result = await createScan({
      metadata,
      images,
      scannedByUserId: user?.id ?? "unknown",
      ...(forceFailStage ? { forceFailStage } : {}),
      ...(fallbackOverride ? { fallbackOverride } : {}),
    });
    setSubmitting(false);

    if (result.ok) {
      router.push(ROUTES.scanStatus(result.data.id));
    }
  }

  function handleSubmitClick() {
    setAttemptedSubmit(true);
    if (!mode && !manualEntryActive) return;
    if (!captureComplete) return;
    const form = document.getElementById(METADATA_FORM_ID);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  const slotLabels = Object.fromEntries(
    CAPTURE_SLOT_ANGLES.map((angle) => [
      angle,
      { label: t(`slots.${angle}.label`), hint: t(`slots.${angle}.hint`) },
    ])
  ) as Record<CaptureSlotAngle, { label: string; hint: string }>;

  const qualityFailureLabels = Object.fromEntries(
    QUALITY_FAILURE_REASONS.map((reason) => [reason, t(`qualityFailure.${reason}`)])
  ) as Record<QualityFailureReason, string>;

  return (
    <div className="lmcs-page-section">
      <WizardProgress
        activeIndex={progressIndex}
        labels={[t("progress.mode"), t("progress.capture"), t("progress.details"), t("progress.submit")]}
      />

      {!manualEntryActive ? (
        <section aria-labelledby="mode-select-heading" className="lmcs-page-section-block">
          <h2 id="mode-select-heading" className="ux4g-title-m-strong ux4g-mb-m">
            {t("modeSelect.heading")}
          </h2>
          <ModeSelectCards
            value={mode}
            onChange={setMode}
            labels={{
              heading: t("modeSelect.heading"),
              device: { title: t("modeSelect.device.title"), body: t("modeSelect.device.body") },
              camera: { title: t("modeSelect.camera.title"), body: t("modeSelect.camera.body") },
              mobile: {
                title: t("modeSelect.mobile.title"),
                body: t("modeSelect.mobile.body"),
              },
            }}
          />
          {attemptedSubmit && !mode ? (
            <p className="ux4g-upload-error-msg" role="alert">
              <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
              {t("modeSelect.requiredPrompt")}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="lmcs-page-section-block">
        <button
          type="button"
          className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
          onClick={() => setManualEntryActive((prev) => !prev)}
        >
          {manualEntryActive ? t("manualEntry.toggleOff") : t("manualEntry.toggleOn")}
        </button>
      </div>

      {manualEntryActive ? (
        <section aria-labelledby="manual-entry-heading" className="lmcs-page-section-block">
          <ManualEntryForm
            onValuesChange={setManualEntryValues}
            labels={{
              heading: t("manualEntry.heading"),
              body: t("manualEntry.body"),
              isImportLabel: t("manualEntry.isImportLabel"),
              valueHint: t("manualEntry.valueHint"),
              fieldLabel: (fieldId) => tDeclarationField(fieldId),
            }}
          />
        </section>
      ) : mode === "mobile" ? (
        <section aria-labelledby="mobile-handoff-heading" className="lmcs-page-section-block">
          <h2 id="mobile-handoff-heading" className="ux4g-sr-only">
            {t("modeSelect.mobile.title")}
          </h2>
          <MobileHandoffPanel
            session={mobileSession}
            onRegenerate={regenerateMobileSession}
            onCancel={cancelMobileSession}
            labels={{
              heading: t("modeSelect.mobile.title"),
              fallbackCodeLabel: t("mobileHandoff.fallbackCodeLabel"),
              waiting: t("mobileHandoff.waiting"),
              connected: t("mobileHandoff.connected"),
              angleCaptured: (angle) => t("mobileHandoff.angleCaptured", { angle }),
              expiresIn: (time) => t("mobileHandoff.expiresIn", { time }),
              expired: t("mobileHandoff.expired"),
              cancelled: t("mobileHandoff.cancelled"),
              generateNewCode: t("mobileHandoff.generateNewCode"),
              cancel: t("mobileHandoff.cancel"),
              allCaptured: t("mobileHandoff.allCaptured"),
              slotLabel: (angle) => t(`slots.${angle}.label`),
            }}
          />
        </section>
      ) : mode ? (
        <CaptureSlotGrid
          mode={mode}
          slots={slots}
          onFileSelected={submitImage}
          onRetake={retake}
          onOverride={override}
          canOverride={canOverride}
          requiredAnglesFilled={requiredAnglesFilled}
          showIncompletePrompt={attemptedSubmit}
          labels={{
            heading: t("slots.heading"),
            incomplete: t("slots.incomplete"),
            empty: t("slots.empty"),
            browse: t("slots.browse"),
            takePhoto: t("slots.takePhoto"),
            retake: t("slots.retake"),
            remove: t("slots.remove"),
            checking: t("slots.checking"),
            passed: t("slots.passed"),
            reviewWarning: t("slots.reviewWarning"),
            override: t("slots.override"),
            overrideReasonLabel: t("slots.overrideReasonLabel"),
            overrideReasonPlaceholder: t("slots.overrideReasonPlaceholder"),
            overrideSubmit: t("slots.overrideSubmit"),
            overrideCancel: t("slots.overrideCancel"),
            overrideReasonRequired: t("slots.overrideReasonRequired"),
            formatHint: t("slots.formatHint", { maxMb: DEFAULT_MAX_UPLOAD_MB }),
            cameraDenied: t("slots.cameraDenied"),
            slot: slotLabels,
            qualityFailure: qualityFailureLabels,
          }}
        />
      ) : null}

      <section aria-labelledby="metadata-heading" className="lmcs-page-section-block">
        <ScanMetadataForm
          formId={METADATA_FORM_ID}
          onSubmit={finishSubmit}
          {...(metadataDefaults ? { defaultValues: metadataDefaults } : {})}
          labels={{
            heading: t("metadata.heading"),
            productNameLabel: t("metadata.productNameLabel"),
            productNameHint: t("metadata.productNameHint"),
            productNameTooLong: t("metadata.productNameTooLongError", {
              max: PRODUCT_NAME_MAX_LENGTH,
            }),
            categoryLabel: t("metadata.categoryLabel"),
            categoryRequired: t("metadata.categoryRequiredError"),
            manufacturerLabel: t("metadata.manufacturerLabel"),
            manufacturerHint: t("metadata.manufacturerHint"),
            regionLabel: t("metadata.regionLabel"),
            regionRequired: t("metadata.regionRequiredError"),
            ecommerceUrlLabel: t("metadata.ecommerceUrlLabel"),
            ecommerceUrlCaption: t("metadata.ecommerceUrlCaption"),
            ecommerceUrlHint: t("metadata.ecommerceUrlHint"),
            ecommerceUrlInvalid: t("metadata.ecommerceUrlInvalidError"),
            categoryOptionLabel: (category) => category,
          }}
        />
      </section>

      <div className="lmcs-page-section-block">
        <button
          type="button"
          className="ux4g-btn ux4g-btn-primary ux4g-btn-lg"
          onClick={handleSubmitClick}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
              {t("submit.submitting")}
            </>
          ) : (
            t("submit.action")
          )}
        </button>
        {attemptedSubmit && (mode || manualEntryActive) && !captureComplete ? (
          <p className="ux4g-upload-error-msg" role="alert">
            <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
            {t("slots.incomplete")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
