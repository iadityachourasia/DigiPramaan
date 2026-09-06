import { NextResponse } from "next/server";

import { createMobileSession } from "@/lib/server/mobile-session-store";

/**
 * POST /api/mobile-sessions — create a Mobile Handoff session (03-scan-upload.md §2).
 * Body: { scanDraftId: string }
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { scanDraftId?: unknown };
  const scanDraftId = typeof body.scanDraftId === "string" ? body.scanDraftId : null;

  if (!scanDraftId) {
    return NextResponse.json({ error: "scanDraftId is required" }, { status: 400 });
  }

  const session = createMobileSession(scanDraftId);
  return NextResponse.json(session, { status: 201 });
}
