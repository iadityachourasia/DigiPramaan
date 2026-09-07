import { NextResponse } from "next/server";

import { archiveRecord } from "@/lib/server/scan-pipeline-store";

interface ArchiveBody {
  userId?: unknown;
}

/**
 * POST /api/records/[id]/archive — Admin-only per 00-README.md §C. No
 * server-side role re-check — the page gates the button on
 * `record.archive` and this endpoint trusts that gate, the same pattern
 * every other mutation in this mock backend already follows.
 *
 * It now requires a `userId`. Archiving removes a record from every default
 * view and was the one Admin-only action that recorded nothing about who did
 * it; the central activity log needs an actor to attribute it to.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ArchiveBody | null;
  const userId = typeof body?.userId === "string" ? body.userId : null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const record = archiveRecord(id, userId);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(record);
}
