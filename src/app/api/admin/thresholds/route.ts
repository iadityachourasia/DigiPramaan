import { NextResponse } from "next/server";
import { getRuleThresholds, isUserActive, updateRuleThresholds } from "@/lib/server/admin-store";
import { emitActivityEvent } from "@/lib/server/audit-store";
import { findMockUser } from "@/lib/mock/users";
import type { RuleThresholds } from "@/types";

export async function GET(request: Request) {
  const viewer = findMockUser(new URL(request.url).searchParams.get("viewerId") ?? "");
  if (!viewer || viewer.role !== "Admin" || !isUserActive(viewer.id)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return NextResponse.json(getRuleThresholds());
}
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { actorId?: unknown; thresholds?: RuleThresholds } | null;
  const actor = typeof body?.actorId === "string" ? findMockUser(body.actorId) : undefined;
  if (!actor || actor.role !== "Admin" || !isUserActive(actor.id) || !body?.thresholds) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const updated = updateRuleThresholds(body.thresholds);
  if (!updated) return NextResponse.json({ error: "Threshold values are invalid." }, { status: 400 });
  emitActivityEvent({ type: "rule_threshold_changed", actorUserId: actor.id, detail: "Rule thresholds were updated." });
  return NextResponse.json(updated);
}
