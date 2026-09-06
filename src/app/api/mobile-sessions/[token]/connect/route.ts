import { NextResponse } from "next/server";

import { connectMobileSession } from "@/lib/server/mobile-session-store";

/** POST /api/mobile-sessions/[token]/connect — the phone joining the session. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = connectMobileSession(token);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found, expired, or already used" },
      { status: 404 }
    );
  }
  return NextResponse.json(session);
}
