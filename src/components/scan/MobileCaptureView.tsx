"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { checkImageQuality, connectMobileSession, reportMobileCapture } from "@/lib/api/scans";
import type { CaptureSlotAngle, MobileHandoffSession, QualityFailureReason } from "@/types";

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

const REQUIRED_ORDER: readonly CaptureSlotAngle[] = ["front", "back", "side_pdp"];

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

  const nextAngle = REQUIRED_ORDER.find((angle) => !session.capturedAngles.includes(angle));

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
  }

  return (
    <div className="lmcs-mobile-capture-view">
      <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
        {tCompanion("connectedTo", { scanDraftId: session.scanDraftId })}
      </p>

      <ul className="lmcs-mobile-handoff-mirror">
        {REQUIRED_ORDER.map((angle) => {
          const done = session.capturedAngles.includes(angle);
          const active = angle === nextAngle;
          return (
            <li
              key={angle}
              className={`ux4g-tag ux4g-tag-s ${
                done
                  ? "ux4g-tag-tonal-success"
                  : active
                    ? "ux4g-tag-tonal-info"
                    : "ux4g-tag-outline-neutral"
              }`}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">
                {done ? "check_circle" : active ? "radio_button_checked" : "radio_button_unchecked"}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
