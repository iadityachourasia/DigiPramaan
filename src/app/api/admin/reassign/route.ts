import { NextResponse } from "next/server";
import { reassignCase } from "@/lib/server/scan-pipeline-store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { recordId?: unknown; newOfficerUserId?: unknown; actorId?: unknown } | null;
  if (typeof body?.recordId !== "string" || typeof body.newOfficerUserId !== "string" || typeof body.actorId !== "string") return NextResponse.json({ error: "recordId, newOfficerUserId and actorId are required" }, { status: 400 });
  const record = reassignCase(body.recordId, body.newOfficerUserId, body.actorId);
  return record ? NextResponse.json(record) : NextResponse.json({ error: "Reassignment is not permitted." }, { status: 403 });
}
