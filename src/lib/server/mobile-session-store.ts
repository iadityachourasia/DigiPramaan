/**
 * mobile-session-store.ts — server-side state for the Mobile Handoff Panel
 * (03-scan-upload.md §2).
 *
 * WHY THIS IS SERVER CODE, NOT A CLIENT-SIDE MOCK
 * ------------------------------------------------
 * Every other mock in this codebase (checkImageQuality, createScan, …) is a
 * branch inside a client-bundled function — fine, because only the one
 * browser tab calling it ever needs the result. A mobile handoff session is
 * different: the desktop tab that generates the QR code and the phone that
 * scans it are two separate browser contexts, and both need to see the SAME
 * session state (has the phone connected yet? which angles has it captured?).
 * A client-side module gives each tab its own private copy — there is no
 * "shared client state" to fall back on here, mock or not.
 *
 * This module backs the Route Handlers under src/app/api/mobile-sessions/,
 * which both the desktop panel and the phone route call over real HTTP —
 * the only part of this page's data layer where "mock" and "real" share
 * literally the same client-side code path (see scans.ts's mobile session
 * functions). The mock-ness is entirely contained here: an in-memory Map
 * standing in for whatever real store a backend would use. It resets on a
 * server restart — an accepted, documented limitation of a prototype, not a
 * real deployment concern (a real backend replaces this file, not its callers).
 */

import { generateHandoffCode } from "@/lib/utils/shortCode";
import type {
  CaptureSlotAngle,
  MobileHandoffSession,
  MobileSessionStatus,
  UploadedImage,
} from "@/types";

const SESSION_TTL_MINUTES = 5;

/*
 * The alphabet and generator moved to `lib/utils/shortCode.ts` when the citizen
 * grievance reference (page 11) needed the same unambiguous character set. Two
 * copies of one idea was one too many.
 */

const sessions = new Map<string, MobileHandoffSession>();

function withResolvedStatus(session: MobileHandoffSession): MobileHandoffSession {
  const isLive = session.status === "waiting" || session.status === "connected";
  if (isLive && new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = "expired";
  }
  return session;
}

export function createMobileSession(scanDraftId: string): MobileHandoffSession {
  let token = generateHandoffCode();
  while (sessions.has(token)) token = generateHandoffCode();

  const now = Date.now();
  const session: MobileHandoffSession = {
    token,
    scanDraftId,
    status: "waiting",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MINUTES * 60 * 1000).toISOString(),
    capturedAngles: [],
    capturedImages: {},
  };
  sessions.set(token, session);
  return session;
}

export function getMobileSession(token: string): MobileHandoffSession | undefined {
  const session = sessions.get(token);
  return session ? withResolvedStatus(session) : undefined;
}

/** Returns undefined if the token doesn't exist or the session can no longer be joined. */
export function connectMobileSession(token: string): MobileHandoffSession | undefined {
  const session = getMobileSession(token);
  if (!session) return undefined;
  if (session.status === "waiting") session.status = "connected";
  return session.status === "connected" ? session : undefined;
}

export function recordMobileCapture(
  token: string,
  angle: CaptureSlotAngle,
  image: UploadedImage
): MobileHandoffSession | undefined {
  const session = getMobileSession(token);
  if (!session || session.status !== "connected") return undefined;
  if (!session.capturedAngles.includes(angle)) {
    session.capturedAngles.push(angle);
  }
  session.capturedImages[angle] = image;
  return session;
}

export function cancelMobileSession(token: string): MobileHandoffSession | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  session.status = "cancelled" satisfies MobileSessionStatus;
  return session;
}
