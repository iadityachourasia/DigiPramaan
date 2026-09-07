/**
 * jurisdiction.ts — Hierarchical Management (13-history-and-hierarchy.md §4.1).
 *
 * WHAT "REGION" AND "JURISDICTION" ACTUALLY ARE, RECONCILED
 * -------------------------------------------------------------
 * Every `region` value anywhere in this codebase — `INSPECTION_REGIONS`,
 * every seed record, both existing mock users' postings — is an Indian
 * *state* name. None is a district. So `region` is not a separate taxonomy
 * needing a mapping table to Jurisdiction; it IS the name of a `State`-level
 * Jurisdiction, and this is a rename/extension, not a parallel system. A
 * `Jurisdiction` row exists for every value already used as a region, plus
 * one `National` root above all of them.
 *
 * There is deliberately no `District` data. `JURISDICTION_LEVELS` keeps the
 * literal from §4.1's own code block, faithful to the spec, but no record,
 * seed or user anywhere has ever been recorded at anything finer than a
 * state — inventing district values now would be fabricating data the
 * system was never given, the same discipline `CITIZEN_REGION_SENTINEL` and
 * `pdfIsTagged: false` already apply elsewhere rather than faking a
 * capability that doesn't exist.
 *
 * This module does not touch `ActivityEvent.region` (history.ts), which
 * stays exactly as documented there: copied at emit time from the record's
 * own region, never joined, never resolved through a Jurisdiction lookup. A
 * past event's recorded region must not change if a record's region — or a
 * user's jurisdiction — is corrected later.
 */

export const JURISDICTION_LEVELS = ["National", "State", "District"] as const;
export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

export interface Jurisdiction {
  id: string;
  level: JurisdictionLevel;
  name: string;
  /** District → State → National. Absent only for the National root. */
  parentJurisdictionId?: string;
}
