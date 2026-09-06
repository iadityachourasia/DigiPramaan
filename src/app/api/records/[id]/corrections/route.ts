import { NextResponse } from "next/server";

import { applyCorrection } from "@/lib/server/scan-pipeline-store";
import { DECLARATION_FIELD_IDS, type DeclarationFieldId } from "@/types";

interface CorrectionBody {
  fieldId?: unknown;
  value?: unknown;
  userId?: unknown;
}

/**
 * POST /api/records/[id]/corrections — one inline field correction
 * (04-extraction-verification.md §3). Sets `corrected`/`correctedByUserId`
 * on the declaration and appends a `Corrected` AuditEvent (see the page 4
 * plan's §C — the existing simple compliance.ts AuditEvent shape, not the
 * richer per-field-diff one proposed for a future History/Activity Log).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as CorrectionBody;

  const fieldId = DECLARATION_FIELD_IDS.includes(body.fieldId as DeclarationFieldId)
    ? (body.fieldId as DeclarationFieldId)
    : null;
  const value = typeof body.value === "string" ? body.value : null;
  const userId = typeof body.userId === "string" ? body.userId : null;

  if (!fieldId || value === null || !userId) {
    return NextResponse.json(
      { error: "fieldId, value and userId are all required" },
      { status: 400 }
    );
  }

  const result = applyCorrection(id, fieldId, value, userId);
  if (!result) {
    return NextResponse.json(
      { error: "Record not found, or not writable" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.record);
}
