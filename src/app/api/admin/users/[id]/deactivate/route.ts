import { NextResponse } from "next/server";
import { deactivateManagedUser } from "@/lib/server/admin-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { actorId?: unknown } | null;
  if (typeof body?.actorId !== "string") return NextResponse.json({ error: "actorId is required" }, { status: 400 });
  const result = deactivateManagedUser(id, body.actorId);
  return result.user ? NextResponse.json(result.user) : NextResponse.json({ error: result.error }, { status: 403 });
}
