"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { ROUTES } from "@/lib/constants";
import type { CaptureSlotAngle, MobileHandoffSession } from "@/types";
import { CAPTURE_SLOT_ANGLES, MANDATORY_CAPTURE_ANGLES } from "@/types";

import { QrCode } from "./QrCode";

/**
 * MobileHandoffPanel — desktop side of "Continue on mobile" (03-scan-upload.md
 * §2). Shown in place of the capture-slot grid until the phone connects; once
 * it does, this collapses to a compact status strip and the wizard mirrors
 * live capture progress into a simple list here (a full CaptureSlot re-render
 * would imply a real thumbnail this device never receives — the desktop only
 * ever learns "this angle landed", not the photo bytes themselves).
 *
 * Countdown uses the real `ux4g-sla-linear` recipe (confirmed against the
 * compiled stylesheet — the design-canvas `SLAProgressIndicator` reference
 * uses different, non-existent class names), which already models exactly
 * this shape: an elapsed/total window with a status that shifts near expiry.
 */

/** The 3 angles the phone-capture flow mirrors here — side_pdp is shown
 * but is not required (see MANDATORY_CAPTURE_ANGLES for what gates
 * completion); "additional" has no phone-capture equivalent. */
const MOBILE_MIRROR_ANGLES: readonly CaptureSlotAngle[] = ["front", "back", "side_pdp"];
const WARNING_THRESHOLD_MS = 60_000;

export interface MobileHandoffPanelProps {
  session: MobileHandoffSession | null;
  onRegenerate: () => void;
  onCancel: () => void;
  labels: {
    heading: string;
    fallbackCodeLabel: string;
    waiting: string;
    connected: string;
    angleCaptured: (label: string) => string;
    expiresIn: (mmss: string) => string;
    expired: string;
    cancelled: string;
    generateNewCode: string;
    cancel: string;
    allCaptured: string;
    slotLabel: (angle: CaptureSlotAngle) => string;
  };
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function MobileHandoffPanel({
  session,
  onRegenerate,
  onCancel,
  labels,
}: MobileHandoffPanelProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!session) {
    return (
      <div className="ux4g-upload-content" role="status">
        <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
      </div>
    );
  }

  const expiresAtMs = new Date(session.expiresAt).getTime();
  const createdAtMs = new Date(session.createdAt).getTime();
  const totalMs = Math.max(1, expiresAtMs - createdAtMs);
  const remainingMs = Math.max(0, expiresAtMs - now);
  const progressPercent = Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100));
  const nearExpiry = remainingMs < WARNING_THRESHOLD_MS;
  const allCaptured = MANDATORY_CAPTURE_ANGLES.every((angle) => session.capturedAngles.includes(angle));

  if (session.status === "expired") {
    return (
      <div className="ux4g-context-alert ux4g-alert-warning">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">schedule</span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-message">{labels.expired}</span>
          <div className="ux4g-alert-actions">
            <button type="button" className="ux4g-btn ux4g-btn-primary ux4g-btn-sm" onClick={onRegenerate}>
              {labels.generateNewCode}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (session.status === "cancelled") {
    return (
      <div className="ux4g-context-alert ux4g-alert-warning">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">block</span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-message">{labels.cancelled}</span>
          <div className="ux4g-alert-actions">
            <button type="button" className="ux4g-btn ux4g-btn-primary ux4g-btn-sm" onClick={onRegenerate}>
              {labels.generateNewCode}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lmcs-mobile-handoff">
      {session.status === "waiting" ? (
        <div className="lmcs-mobile-handoff-qr">
          <QrCode value={`${window.location.origin}${ROUTES.scanMobile(session.token)}`} />
          <div className="ux4g-card ux4g-card-outline lmcs-mobile-handoff-code">
            <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {labels.fallbackCodeLabel}
            </span>
            <span className="ux4g-heading-m-strong lmcs-mobile-handoff-code-value">
              {session.token}
            </span>
          </div>
        </div>
      ) : null}

      <div className="ux4g-context-alert ux4g-alert-info">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">
          {session.status === "connected" ? "phonelink_ring" : "hourglass_top"}
        </span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-message" role="status">
            {allCaptured
              ? labels.allCaptured
              : session.status === "connected"
                ? labels.connected
                : labels.waiting}
          </span>
        </div>
      </div>

      {!allCaptured ? (
        <div
          className={`ux4g-sla-linear ux4g-sla-status-${nearExpiry ? "warning" : "default"}`}
          style={{ "--ux4g-sla-progress": progressPercent } as CSSProperties}
        >
          <span className="ux4g-sla-linear-leading" aria-hidden="true">
            <span className="ux4g-icon-outlined">schedule</span>
          </span>
          <div className="ux4g-sla-linear-body">
            <div className="ux4g-sla-linear-head">
              <div className="ux4g-sla-linear-title-wrap">
                <p className="ux4g-sla-linear-title">{labels.expiresIn(formatCountdown(remainingMs))}</p>
              </div>
            </div>
            <div className="ux4g-sla-linear-track">
              <div className="ux4g-sla-linear-fill" />
            </div>
          </div>
        </div>
      ) : null}

      {session.status === "connected" ? (
        <ul className="lmcs-mobile-handoff-mirror">
          {CAPTURE_SLOT_ANGLES.filter((angle): angle is CaptureSlotAngle =>
            MOBILE_MIRROR_ANGLES.includes(angle as CaptureSlotAngle)
          ).map((angle) => {
            const captured = session.capturedAngles.includes(angle);
            return (
              <li
                key={angle}
                className={`ux4g-tag ux4g-tag-s ${captured ? "ux4g-tag-tonal-success" : "ux4g-tag-outline-neutral"}`}
              >
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  {captured ? "check_circle" : "radio_button_unchecked"}
                </span>
                {captured ? labels.angleCaptured(labels.slotLabel(angle)) : labels.slotLabel(angle)}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="ux4g-upload-actions">
        {session.status === "waiting" ? (
          <button type="button" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" onClick={onRegenerate}>
            {labels.generateNewCode}
          </button>
        ) : null}
        <button type="button" className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
