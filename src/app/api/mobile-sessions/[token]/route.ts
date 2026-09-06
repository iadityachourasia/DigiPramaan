import { NextResponse } from "next/server";

import { cancelMobileSession, getMobileSession } from "@/lib/server/mobile-session-store";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/** GET /api/mobile-sessions/[token] — polled by the desktop panel. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  const session = getMobileSession(token);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

/** DELETE /api/mobile-sessions/[token] — the desktop's Cancel action. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  const session = cancelMobileSession(token);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}
