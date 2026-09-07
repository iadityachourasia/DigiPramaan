/**
 * Mock jurisdiction data (13-history-and-hierarchy.md §4.1).
 *
 * One `National` root plus one `State` row per `INSPECTION_REGIONS` value —
 * see `jurisdiction.ts`'s own doc comment for why this is a rename/
 * extension of the existing `region` field rather than a second taxonomy.
 * No `District` rows: nothing in this codebase has ever recorded anything
 * finer than a state, so seeding districts now would be inventing data.
 */

import { INSPECTION_REGIONS } from "./reference";
import type { Jurisdiction } from "@/types";

export const NATIONAL_JURISDICTION_ID = "jur-national";

function stateJurisdictionId(region: string): string {
  return `jur-state-${region.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

export const MOCK_JURISDICTIONS: readonly Jurisdiction[] = [
  { id: NATIONAL_JURISDICTION_ID, level: "National", name: "National" },
  ...INSPECTION_REGIONS.map(
    (region): Jurisdiction => ({
      id: stateJurisdictionId(region),
      level: "State",
      name: region,
      parentJurisdictionId: NATIONAL_JURISDICTION_ID,
    })
  ),
];

export function findJurisdiction(id: string): Jurisdiction | undefined {
  return MOCK_JURISDICTIONS.find((jurisdiction) => jurisdiction.id === id);
}

export function jurisdictionIdForState(region: string): string {
  return stateJurisdictionId(region);
}

/**
 * The `region` values a viewer at this jurisdiction may see, or `null`
 * meaning "every region — do not filter at all."
 *
 * `null` rather than "every state's name" specifically because at least one
 * real region value, `CITIZEN_REGION_SENTINEL` ("Not specified"), is not
 * any state's name and never will be — a National viewer enumerating "all 18
 * states" as their visible set would silently lose every citizen report
 * with no identified region, which is not what "sees everything" means.
 *
 * `National` and an unresolvable id both return `null` — see
 * `scopeRecordsForViewer` in scan-pipeline-store.ts for why failing open
 * (unscoped) rather than closed (empty) is the correct direction for an
 * unresolvable viewer in a build with no server-side auth to begin with.
 * `State` returns exactly that state's own name. `District` returns `[]`:
 * no record has ever been recorded at that granularity, so a District
 * viewer's scope is honestly empty rather than guessed.
 */
export function regionNamesVisibleTo(jurisdictionId: string): string[] | null {
  const jurisdiction = findJurisdiction(jurisdictionId);
  if (!jurisdiction || jurisdiction.level === "National") return null;
  if (jurisdiction.level === "State") return [jurisdiction.name];
  return [];
}
