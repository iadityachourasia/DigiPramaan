import { NextResponse } from "next/server";

import { archiveRecord } from "@/lib/server/scan-pipeline-store";

/**
 * POST /api/records/[id]/archive — Admin-only per 00-README.md §C. No
 * server-side role re-check — the page gates the button on
 * `record.archive` and this endpoint trusts that gate, the same pattern
 * every other mutation in this mock backend already follows.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = archiveRecord(id);
  if (!record) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(record);
}
