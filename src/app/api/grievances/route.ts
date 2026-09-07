import { NextResponse } from "next/server";

import {
  MAX_PHOTO_BYTES,
  checkRateLimit,
  submitGrievance,
} from "@/lib/server/grievance-store";
import { GRIEVANCE_CONCERNS, type GrievanceConcern } from "@/types";

/**
 * POST /api/grievances — the citizen submission (page 11).
 *
 * THE ONLY ENDPOINT IN THIS APP THAT IS MEANT TO BE PUBLIC.
 *
 * It takes no user id, because there is no user: page 11 §6 requires that no
 * login or account creation appear anywhere in this flow. The record it
 * creates is attributed to a documented citizen actor, not to a mock officer.
 *
 * The guards below are deliberately modest and deliberately visible. See
 * `grievance-store.ts` for a plain statement of what they do not achieve —
 * in short, they are demo-grade, and the app-wide absence of server-side auth
 * is a pre-existing gap this endpoint inherits rather than one it introduces.
 */

interface SubmitBody {
  photo?: unknown;
  concerns?: unknown;
  concernNote?: unknown;
  shopNameOrLocation?: unknown;
  submitterName?: unknown;
  submitterContact?: unknown;
  qualityNote?: unknown;
  /** Hidden field no human ever fills. See below. */
  website?: unknown;
}

interface PhotoBody {
  fileName?: unknown;
  url?: unknown;
  sizeBytes?: unknown;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Best-effort client key. `x-forwarded-for` is trivially forged, which is
 * exactly why the rate limit it feeds is described as demo-grade rather than
 * as protection.
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown-client";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SubmitBody | null;
  if (!body) {
    return NextResponse.json({ error: "A submission body is required" }, { status: 400 });
  }

  /*
   * Honeypot: a field hidden from people but not from a naive bot. A filled one
   * gets 202 and is dropped without being stored, so an automated submitter
   * sees success and has no signal to adapt to.
   */
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  const photo = (body.photo ?? null) as PhotoBody | null;
  const fileName = typeof photo?.fileName === "string" ? photo.fileName : null;
  const url = typeof photo?.url === "string" ? photo.url : null;
  const sizeBytes = typeof photo?.sizeBytes === "number" ? photo.sizeBytes : 0;

  /* The one required field, per page 11 §2 and its Definition of Done. */
  if (!fileName || !url) {
    return NextResponse.json({ error: "A photo is required" }, { status: 400 });
  }

  if (sizeBytes > MAX_PHOTO_BYTES || url.length > MAX_PHOTO_BYTES * 2) {
    return NextResponse.json(
      { error: "That photo is too large. Please attach one under 8 MB." },
      { status: 413 }
    );
  }

  const verdict = checkRateLimit(clientKey(request));
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "Too many reports from this connection. Please try again later." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  const concerns = Array.isArray(body.concerns)
    ? body.concerns.filter((concern): concern is GrievanceConcern =>
        GRIEVANCE_CONCERNS.includes(concern as GrievanceConcern)
      )
    : [];

  const result = submitGrievance({
    photo: { fileName, url, sizeBytes },
    concerns,
    ...(optionalString(body.concernNote) ? { concernNote: optionalString(body.concernNote)! } : {}),
    ...(optionalString(body.shopNameOrLocation)
      ? { shopNameOrLocation: optionalString(body.shopNameOrLocation)! }
      : {}),
    ...(optionalString(body.submitterName)
      ? { submitterName: optionalString(body.submitterName)! }
      : {}),
    ...(optionalString(body.submitterContact)
      ? { submitterContact: optionalString(body.submitterContact)! }
      : {}),
    ...(optionalString(body.qualityNote) ? { qualityNote: optionalString(body.qualityNote)! } : {}),
  });

  return NextResponse.json(result, { status: 201 });
}
