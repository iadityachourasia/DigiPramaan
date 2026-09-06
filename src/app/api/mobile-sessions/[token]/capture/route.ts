import { NextResponse } from "next/server";

import { recordMobileCapture } from "@/lib/server/mobile-session-store";
import { CAPTURE_SLOT_ANGLES, type CaptureSlotAngle } from "@/types";

interface CaptureBody {
  angle?: unknown;
  fileName?: unknown;
  sizeBytes?: unknown;
  /** A data: URL — this mock has no object storage (see mobile-session-store.ts). */
  dataUrl?: unknown;
}

/**
 * POST /api/mobile-sessions/[token]/capture — the phone reporting one angle
 * that passed its own quality check (the check itself runs client-side on
 * the phone, same as the desktop path). Carries the actual photo as a data:
 * URL so the desktop tab receives a real evidence image, not just a flag.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = (await request.json()) as CaptureBody;

  const angle = CAPTURE_SLOT_ANGLES.includes(body.angle as CaptureSlotAngle)
    ? (body.angle as CaptureSlotAngle)
    : null;
  const fileName = typeof body.fileName === "string" ? body.fileName : null;
  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : null;
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : null;

  if (!angle || !fileName || sizeBytes === null || !dataUrl) {
    return NextResponse.json(
      { error: "angle, fileName, sizeBytes and dataUrl are all required" },
      { status: 400 }
    );
  }

  const session = recordMobileCapture(token, angle, {
    id: `${token}-${angle}`,
    fileName,
    url: dataUrl,
    sizeBytes,
    angle,
    altText: `${angle} label photograph, captured on mobile`,
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found or not connected" },
      { status: 404 }
    );
  }
  return NextResponse.json(session);
}
