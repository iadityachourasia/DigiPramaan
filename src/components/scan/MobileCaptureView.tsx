"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  checkImageQuality,
  connectMobileSession,
  completeMobileHandoff,
  reportMobileCapture,
  uploadMobileCaptureImage,
} from "@/lib/api/scans";
import { isMockMode } from "@/lib/api/client";
import type { CaptureSlotAngle, MobileHandoffSession, QualityFailureReason } from "@/types";
import { MANDATORY_CAPTURE_ANGLES } from "@/types";

import { CameraPreview } from "./CameraPreview";

/**
 * MobileCaptureView — the Mobile Capture Companion (03-scan-upload.md §2).
 * Camera-first, one angle emphasized at a time (not three simultaneous zones
 * like the desktop grid — the phone guides the officer through Front, then
 * Back, then Side-PDP, in order), ending in a "you can close this page" state.
 *
 * The quality gate runs here exactly as it does on desktop (same
 * `checkImageQuality` call) — only the "this angle is done" fact, plus the
 * actual photo, needs to reach the desktop tab, via `reportMobileCapture`.
 *
 * Reads its own translations via `useTranslations` rather than accepting a
 * `labels` object built by the (server-component) page: a server component
 * cannot pass functions as props to a client component ("Functions cannot be
 * passed directly to Client Components"), and several labels here are
 * naturally functions of runtime data (the angle, the failure reason).
 */

/** Capture order on the phone. Front/back are mandatory; side_pdp is
 * offered but skippable — many products carry no printed declarations on
 * a side panel at all (see MANDATORY_CAPTURE_ANGLES, src/types/scan.ts). */
const CAPTURE_ORDER: readonly CaptureSlotAngle[] = ["front", "back", "side_pdp"];

export interface MobileCaptureViewProps {
  token: string;
}

type LocalStatus = "idle" | "checking" | "failed";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MobileCaptureView({ token }: MobileCaptureViewProps) {
  const t = useTranslations("scan");
  const tCompanion = useTranslations("scan.mobileCompanion");

  const [session, setSession] = useState<MobileHandoffSession | null>(null);
  const [connectFailed, setConnectFailed] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalStatus>("idle");
  const [failureReason, setFailureReason] = useState<QualityFailureReason | null>(null);
  const [skippedAngles, setSkippedAngles] = useState<ReadonlySet<CaptureSlotAngle>>(new Set());
  /* Guards against signaling "complete" twice — mandatory angles can be
   * satisfied before the officer decides whether to also add the
   * optional side_pdp photo, so this can otherwise fire once when
   * front/back land and again if side_pdp follows or gets skipped. */
  const completeSignaledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    connectMobileSession(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setSession(result.data);
      else setConnectFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (connectFailed) {
    return (
      <div className="ux4g-context-alert ux4g-alert-warning">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">error</span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-message">{tCompanion("sessionExpired")}</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="ux4g-upload-content" role="status">
        <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
      </div>
    );
  }

  if (session.status === "cancelled") {
    return (
      <div className="ux4g-context-alert ux4g-alert-warning">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">block</span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-message">{tCompanion("sessionEnded")}</span>
        </div>
      </div>
    );
  }

  const nextAngle = CAPTURE_ORDER.find(
    (angle) => !session.capturedAngles.includes(angle) && !skippedAngles.has(angle)
  );

  async function handleSkip(angle: CaptureSlotAngle) {
    const updated = new Set(skippedAngles);
    updated.add(angle);
    setSkippedAngles(updated);

    const mandatoryDone = MANDATORY_CAPTURE_ANGLES.every((mandatory) =>
      session!.capturedAngles.includes(mandatory)
    );
    if (mandatoryDone && !isMockMode() && !completeSignaledRef.current) {
      completeSignaledRef.current = true;
      await completeMobileHandoff(token);
    }
  }

  if (!nextAngle) {
    return (
      <div className="ux4g-context-alert ux4g-alert-success">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">check_circle</span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-title">{tCompanion("allDoneTitle")}</span>
          <span className="ux4g-alert-message">{tCompanion("allDoneBody")}</span>
        </div>
      </div>
    );
  }

  async function handleCapture(file: File) {
    setLocalStatus("checking");
    setFailureReason(null);

    if (isMockMode()) {
      const result = await checkImageQuality({ angle: nextAngle!, file });

      if (!result.ok || !result.data.passed) {
        setFailureReason(result.ok ? (result.data.failureReason ?? null) : null);
        setLocalStatus("failed");
        return;
      }

      const dataUrl = await fileToDataUrl(file);
      const reportResult = await reportMobileCapture(token, {
        angle: nextAngle!,
        fileName: file.name,
        sizeBytes: file.size,
        dataUrl,
      });

      setLocalStatus("idle");
      if (reportResult.ok) setSession(reportResult.data);
      return;
    }

    /*
     * Real mode: one call does what mock mode needed two for — the
     * backend's own evaluate_image_quality() runs server-side and the
     * image is persisted as real EvidenceImage in the same request, so
     * there's no separate pre-check round trip here.
     */
    const uploadResult = await uploadMobileCaptureImage(token, nextAngle!, file);
    if (!uploadResult.ok) {
      setFailureReason(null);
      setLocalStatus("failed");
      return;
    }
    if (!uploadResult.data.passed) {
      setFailureReason(uploadResult.data.failureReason);
      setLocalStatus("failed");
      return;
    }

    setLocalStatus("idle");
    const nextStatus = await connectMobileSession(token);
    if (nextStatus.ok) {
      setSession(nextStatus.data);
      const mandatoryDone = MANDATORY_CAPTURE_ANGLES.every((angle) =>
        nextStatus.data.capturedAngles.includes(angle)
      );
      if (mandatoryDone && !completeSignaledRef.current) {
        completeSignaledRef.current = true;
        await completeMobileHandoff(token);
      }
    }
  }

  return (
    <div className="lmcs-mobile-capture-view">
      <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
        {tCompanion("connectedTo", { scanDraftId: session.scanDraftId })}
      </p>

      <ul className="lmcs-mobile-handoff-mirror">
        {CAPTURE_ORDER.map((angle) => {
          const done = session.capturedAngles.includes(angle);
          const skipped = skippedAngles.has(angle);
          const active = angle === nextAngle;
          return (
            <li
              key={angle}
              className={`ux4g-tag ux4g-tag-s ${
                done
                  ? "ux4g-tag-tonal-success"
                  : skipped
                    ? "ux4g-tag-tonal-neutral"
                    : active
                      ? "ux4g-tag-tonal-info"
                      : "ux4g-tag-outline-neutral"
              }`}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">
                {done
                  ? "check_circle"
                  : skipped
                    ? "remove_circle_outline"
                    : active
                      ? "radio_button_checked"
                      : "radio_button_unchecked"}
              </span>
              {t(`slots.${angle}.label`)}
            </li>
          );
        })}
      </ul>

      <h1 className="ux4g-heading-m-strong">{t(`slots.${nextAngle}.label`)}</h1>

      <div
        className={`ux4g-upload ${
          localStatus === "checking"
            ? "ux4g-upload-state-scanning"
            : localStatus === "failed"
              ? "ux4g-upload-state-error"
              : "ux4g-upload-state-selecting"
        }`}
      >
        <div className="ux4g-upload-panel">
          {localStatus === "checking" ? (
            <div className="ux4g-upload-content" role="status">
              <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
              <p className="ux4g-body-s-default">{t("slots.checking")}</p>
            </div>
          ) : (
            <div className="ux4g-upload-content">
              {localStatus === "failed" && failureReason ? (
                <p className="ux4g-upload-error-msg" role="alert">
                  <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
                  {t(`qualityFailure.${failureReason}`)}
                </p>
              ) : null}
              <CameraPreview
                captureLabel={localStatus === "failed" ? t("slots.retake") : t("slots.takePhoto")}
                cameraDeniedMessage={t("slots.cameraDenied")}
                onCapture={handleCapture}
              />
              {nextAngle === "side_pdp" ? (
                <button
                  type="button"
                  className="ux4g-btn ux4g-btn-text-neutral ux4g-btn-sm"
                  onClick={() => handleSkip(nextAngle)}
                >
                  {t("slots.skipSidePdp")}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
