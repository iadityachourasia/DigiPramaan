/**
 * Shared reference lists the mock data and the form dropdowns both draw on.
 */

/**
 * Inspection regions.
 *
 * TODO: BRD §15 Q-05 is unresolved — a central DoCA pilot and a state-level rollout
 * want different value lists here. This is the state list, which is the superset;
 * narrowing it later is a one-line change.
 */
export const INSPECTION_REGIONS = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
] as const;

/**
 * Known manufacturers, used by the Scan/Upload autocomplete and the Manufacturer
 * Scorecard search. Fictional names, so no real company is shown as non-compliant
 * in a demo.
 *
 * KNOWN LIMITATION (BRD R-02): matching is exact. Two spellings of one company are
 * two entries here, which can undercount a repeat offender. Surfaced in the
 * Scorecard's own copy rather than hidden.
 */
export interface MockManufacturer {
  id: string;
  name: string;
}

export const MOCK_MANUFACTURERS: readonly MockManufacturer[] = [
  { id: "mfr-001", name: "Sahyadri Foods Pvt Ltd" },
  { id: "mfr-002", name: "Ganga Beverages Ltd" },
  { id: "mfr-003", name: "Nilgiri Personal Care" },
  { id: "mfr-004", name: "Deccan Household Products" },
  { id: "mfr-005", name: "Konkan Spice Company" },
  { id: "mfr-006", name: "Aravalli Textiles Ltd" },
  { id: "mfr-007", name: "Meridian Imports (India)" },
];

export function manufacturerName(id: string): string {
  return MOCK_MANUFACTURERS.find((m) => m.id === id)?.name ?? "Unknown";
}
