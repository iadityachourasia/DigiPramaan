"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelMobileSession,
  createMobileSession,
  pollMobileSession,
} from "@/lib/api/scans";
import type { MobileHandoffSession } from "@/types";

const POLL_INTERVAL_MS = 2500;
const REQUIRED_ANGLES = ["front", "back", "side_pdp"] as const;

function isSettled(session: MobileHandoffSession): boolean {
  return (
    session.status === "expired" ||
    session.status === "cancelled" ||
    REQUIRED_ANGLES.every((angle) => session.capturedAngles.includes(angle))
  );
}

/**
 * useMobileHandoffSession — desktop side of the Mobile Handoff Panel
 * (03-scan-upload.md §2). Creates a session, polls it on a plain interval
 * (this repo has no websocket/SSE infrastructure — confirmed before choosing
 * this approach) until the phone finishes or the code expires, and exposes
 * regenerate/cancel for the two explicit actions the panel offers. No
 * separate "creating" state: the caller distinguishes "no session yet" from
 * "session ready" by whether `session` is null, which is enough for the
 * panel's own loading state and avoids a synchronous `setState` at the top
 * of a re-running (non-mount-only) effect — exactly the "cascading render"
 * shape `react-hooks/set-state-in-effect` flags.
 */
export function useMobileHandoffSession(scanDraftId: string, active: boolean) {
  const [session, setSession] = useState<MobileHandoffSession | null>(null);
  const sessionRef = useRef<MobileHandoffSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    createMobileSession(scanDraftId).then((result) => {
      if (!cancelled && result.ok) setSession(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [active, scanDraftId]);

  const regenerate = useCallback(() => {
    /*
     * Real mode: pass the EXISTING real scan id (if a session was already
     * created) so regenerating the QR revokes-and-replaces the token for
     * the SAME scan session rather than abandoning any images already
     * captured under it — see createMobileHandoff's own scanId-aware
     * branch on the backend.
     */
    createMobileSession(scanDraftId, sessionRef.current?.scanDraftId).then((result) => {
      if (result.ok) setSession(result.data);
    });
  }, [scanDraftId]);

  /* `session` is only ever meaningful while the panel is open. */
  const visibleSession = active ? session : null;

  useEffect(() => {
    if (!visibleSession || isSettled(visibleSession)) return;

    const interval = setInterval(() => {
      pollMobileSession(visibleSession.token).then((result) => {
        if (result.ok) setSession(result.data);
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [visibleSession]);

  const cancel = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    /* `scanDraftId` carries the real backend scan id in real mode (see
     * scans.ts's own docstring on this) — mock mode's cancelMobileSession
     * ignores the second argument entirely. */
    cancelMobileSession(current.token, current.scanDraftId).then((result) => {
      if (result.ok) setSession(result.data);
    });
  }, []);

  return { session: visibleSession, regenerate, cancel };
}
