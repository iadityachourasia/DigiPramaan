import { NextResponse } from "next/server";

import { createReportRun } from "@/lib/server/report-store";
import { REPORT_FORMATS, REPORT_STAGE_IDS, type ReportFormat, type ReportScope, type ReportStageId } from "@/types";

interface GenerateBody {
  scope?: unknown;
  formats?: unknown;
  userId?: unknown;
  userName?: unknown;
  forceFailStage?: unknown;
}

/**
 * POST /api/reports/generate — starts a generation run (10 §3 step 4).
 *
 * Returns 200 with `blocked` populated when generation refuses to start,
 * rather than an error status. That mirrors `verifyRecord` returning
 * `blockedFields` (04 §4): the user clicks and is told precisely why, instead
 * of facing a pre-disabled button with no explanation.
 *
 * No server-side role re-check. All three roles hold `report.generate` per the
 * Role Permission Matrix, and this endpoint trusts the page gate the same way
 * every other mutation in this mock backend does.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as GenerateBody;

  const scope = body.scope as ReportScope | undefined;
  const userId = typeof body.userId === "string" ? body.userId : null;
  const userName = typeof body.userName === "string" ? body.userName : null;

  const formats = Array.isArray(body.formats)
    ? body.formats.filter((format): format is ReportFormat =>
        REPORT_FORMATS.includes(format as ReportFormat)
      )
    : [];

  if (!scope || typeof scope !== "object" || !("kind" in scope) || !userId || !userName) {
    return NextResponse.json(
      { error: "scope, userId and userName are all required" },
      { status: 400 }
    );
  }

  const forceFailStage = REPORT_STAGE_IDS.includes(body.forceFailStage as ReportStageId)
    ? (body.forceFailStage as ReportStageId)
    : undefined;

  return NextResponse.json(
    createReportRun({
      scope,
      formats,
      generatedByUserId: userId,
      generatedByUserName: userName,
      ...(forceFailStage ? { forceFailStage } : {}),
    })
  );
}
