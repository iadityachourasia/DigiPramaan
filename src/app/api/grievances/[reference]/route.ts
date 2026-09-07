import { NextResponse } from "next/server";

import { lookupGrievance } from "@/lib/server/grievance-store";

/**
 * GET /api/grievances/[reference] — the public status lookup (page 11 §2).
 *
 * Returns only the coarse three-value public status and a date. Never the
 * internal Compliance Status, never an officer name, never a rule citation —
 * see `publicStatusFor` for the mapping and for why a verified record reports
 * `Resolved` whether it was found compliant or not.
 *
 * The 404 body is deliberately the same whether the reference never existed or
 * is simply malformed, so the endpoint cannot be used to work out which
 * references are real.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const lookup = lookupGrievance(reference);

  if (!lookup) {
    return NextResponse.json({ error: "No report found with that reference" }, { status: 404 });
  }

  return NextResponse.json(lookup);
}
