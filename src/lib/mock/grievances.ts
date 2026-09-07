/**
 * Citizen Grievance Portal fixtures (page 11).
 *
 * The lookup results use the public three-value vocabulary, never the internal
 * Compliance Status. 11 §2 is explicit that a citizen must not see internal officer
 * workflow detail, so nothing here carries an officer name, a rule citation, or a
 * verification state.
 */

import type { GrievanceStatusLookup } from "@/types";

/**
 * Tracking references a demo can type into the status lookup. The format is
 * deliberately short and readable aloud, because a citizen may write it down from a
 * phone screen while standing in a shop.
 */
export const MOCK_GRIEVANCE_LOOKUPS: readonly GrievanceStatusLookup[] = [
  {
    reference: "LM-4K7P2Q",
    status: "Received",
    lastUpdatedAt: "2026-09-04T18:47:00+05:30",
  },
  {
    reference: "LM-8B3N5T",
    status: "Under Review",
    lastUpdatedAt: "2026-09-02T11:30:00+05:30",
  },
  {
    reference: "LM-2X9W6R",
    status: "Resolved",
    lastUpdatedAt: "2026-08-21T14:12:00+05:30",
  },
];

export function lookupMockGrievance(
  reference: string
): GrievanceStatusLookup | undefined {
  const normalized = reference.trim().toUpperCase();
  return MOCK_GRIEVANCE_LOOKUPS.find((entry) => entry.reference === normalized);
}

/*
 * The reference generator that used to live here moved to
 * `lib/utils/shortCode.ts`, where mobile handoff's near-identical generator
 * also now lives. Both need the same unambiguous alphabet, and the grievance
 * reference additionally needs `crypto.getRandomValues` rather than
 * `Math.random()` — it is the only key a citizen holds to their submission.
 */
export { generateGrievanceReference } from "@/lib/utils/shortCode";
