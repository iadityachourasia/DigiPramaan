import { NextResponse } from "next/server";

import { findMockUser } from "@/lib/mock/users";
import { isUserActive } from "@/lib/server/admin-store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = findMockUser(id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isUserActive(id)) return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
  return NextResponse.json({ active: true });
}
