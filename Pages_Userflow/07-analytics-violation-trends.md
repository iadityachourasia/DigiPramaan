# Page 7 — Analytics & Violation Trends

> See `00-README.md` for the Status Model, Canonical Violation Taxonomy, and
> Fixed Vocabulary this file assumes. Fixed in this revision: the
> violation-type breakdown now uses the exact 10-category canonical
> taxonomy from the README, replacing the previous ad hoc category names
> ("missing MRP," "font-size failure") that didn't match page 6's wording.

## 1. Purpose & Why It Matters

Individual records tell you about one product; this page tells enforcement
leadership where to focus effort next. It's what turns your system from a
logging tool into a genuine surveillance/prioritization tool.

## 2. Sections & Fields

### Summary Charts
- Total scanned, compliance rate (%), processing success rate (% of scans
  that completed extraction without failure)

### Time Trends
- Compliant vs. Non-Compliant scans by day/week/month — line or bar chart
  with a period toggle

### Violation-Type Breakdown
- Donut or bar chart using the exact Canonical Violation Taxonomy (10
  categories) from the README — do not introduce new category names or
  reword existing ones here

### Category Analysis
- Violations by product category (from Scan/Upload metadata)

### Regional Distribution
- Table or bar chart by state/region — deliberately not a GIS map for MVP

### Source Breakdown
- Officer-Scanned vs. Citizen-Reported vs. E-commerce-Sourced

### Anomaly / Hotspot Alerts
- Backend-detected unusual increases or concentrations (e.g. a manufacturer
  or region spiking above baseline) — surfaced as cards, each drilling down

### Drill Down
- Clicking any chart segment, bar, or table row navigates to Compliance
  Records pre-filtered to match that segment

## 3. User Flow

1. User (typically Admin, Enforcement Officer, or Reviewer) arrives from
   Dashboard or direct navigation
2. User scans summary charts, then examines time-trend/breakdown charts
3. User clicks into a specific segment to drill into the underlying records
4. User may cross-reference with the Manufacturer Scorecard (page 9)

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| Insufficient data for a trend (e.g. first week of deployment) | "Not enough data yet for this view" |
| No anomalies detected | "No anomalies detected in the current period" |
| Filter/period change | Charts update without a full page reload; loading state on charts specifically |

## 5. UX4G / Design Notes

- All chart colors from data-viz role tokens — this page has the most
  charts in the system, so double-check no invented hex values crept in.
- Drill-down interactions need a clear affordance (cursor state, hover
  treatment).
- The violation-type taxonomy must match pages 4 and 6 exactly — use the
  README's canonical list, don't rename categories here for chart brevity
  beyond the abbreviation rule the README specifies (axis labels only).

## 6. Definition of Done

- [ ] Violation-type breakdown uses the exact 10-category Canonical
      Violation Taxonomy — verified against `00-README.md`, not
      reinvented
- [ ] Every chart/table row is drill-down clickable to filtered Records
- [ ] Regional view is a table or bar chart (not a GIS map)
- [ ] Source breakdown shows all three channels
- [ ] Insufficient-data and no-anomaly states are handled explicitly

## 7. Claude Design Prompt

```
Build the Analytics & Violation Trends page inside our existing app shell.

Reuse existing components: Card, chart components from our library. Do not
introduce new hex values for chart colors — use our data-viz role tokens
only; ask if a needed chart color token doesn't exist yet.

Sections needed:
- Summary: total scanned, compliance rate %, processing success rate %
- Time trend chart: Compliant vs Non-Compliant scans by day/week/month with
  a period toggle
- Violation-type breakdown (donut or bar) using exactly these 10
  categories, worded exactly like this, matching the Extraction &
  Verification and Product Compliance Detail pages:
  Manufacturer/Packer/Importer Details Missing, Generic Name Missing or
  Incorrect, Net Quantity Missing or Incorrect, Manufacture/Import Date
  Missing, MRP Non-Compliance, Country of Origin Missing, Consumer Care
  Details Missing, Font Size / Readability Failure, Non-Standard or
  Misleading Format, Other
- Category analysis: violations by product category
- Regional distribution: sortable table or horizontal bar chart by state/
  region (explicitly not a GIS map for this MVP)
- Source breakdown: Officer-Scanned vs Citizen-Reported vs E-commerce-Sourced
- Anomaly/hotspot alert cards
- Every chart segment, bar, and table row must be clickable, drilling down
  to Compliance Records pre-filtered to match that segment

States to implement explicitly:
1. Insufficient data for a given trend view — explicit "not enough data
   yet" message instead of a flat or misleading chart
2. No anomalies in current period — explicit message
3. Period/filter change — charts show a loading state individually, not a
   full page reload

Check this against our design system rules before finalizing, and
specifically confirm the violation-type category wording matches
00-README.md exactly before finalizing — flag anything that couldn't fully
comply instead of approximating it.
```
