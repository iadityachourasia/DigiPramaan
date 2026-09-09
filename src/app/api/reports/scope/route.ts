import { NextResponse } from "next/server";

import { describeScope, isLargeScope, resolveScopeRecords } from "@/lib/server/report-store";
import type { ReportScope } from "@/types";

interface ScopeBody {
  scope?: unknown;
  viewerId?: unknown;
}

/**
 * POST /api/reports/scope — how many records a scope covers, without
 * generating anything.
 *
 * Backs two states in 10 §4: the zero-record block and the large-scope
 * warning, both of which have to be known *before* the user commits to
 * generating. A POST rather than a GET because a filtered scope carries a
 * whole `RecordFilters` object, not a couple of ids.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as ScopeBody;
  const scope = body.scope as ReportScope | undefined;
  const viewerId = typeof body.viewerId === "string" ? body.viewerId : undefined;

  if (!scope || typeof scope !== "object" || !("kind" in scope)) {
    return NextResponse.json({ error: "A scope is required" }, { status: 400 });
  }

  /*
   * The label comes back with the count so the builder can name what the user
   * is about to report on ("Ganga Sparkling Lemon 600 ml") rather than
   * echoing the id from the URL back at them.
   */
  const records = resolveScopeRecords(scope, viewerId);
  return NextResponse.json({
    rowCount: records.length,
    large: isLargeScope(records.length),
    label: describeScope(scope, records),
  });
}
