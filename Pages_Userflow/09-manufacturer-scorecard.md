# Page 9 — Manufacturer Compliance Scorecard (USP)

> See `00-README.md` for the Status Model, Canonical Violation Taxonomy,
> Role Permission Matrix, and Fixed Vocabulary this file assumes. Fixed in
> this revision: the violation-type breakdown uses the exact canonical
> taxonomy; role references use full names; "Flag for Enforcement" is
> explicitly scoped to Enforcement Officer/Admin, not Reviewer.

## 1. Purpose & Why It Matters

Every other page in this system is organized around individual products.
This page re-slices the same underlying data by manufacturer, which is the
actual unit enforcement decisions get made against. It's cheap to build
(largely a groupby over data you already have from Compliance Records) but
it's the difference between "we log violations" and "we tell you who to
investigate next."

## 2. Sections & Fields

### Manufacturer Search/Select
- Search or dropdown to select a manufacturer (autocomplete against the
  same manufacturer list used in Scan/Upload metadata)

### Manufacturer Summary Header
- Manufacturer name, total products scanned, overall compliance rate
  (share of `Verified` records with Compliance Status `Compliant`),
  first-scanned date, most recent scan date

### Compliance Rate Over Time
- Line chart showing this manufacturer's compliance rate trend

### Repeat-Violation Flag
- A clear, prominent indicator when a manufacturer crosses a defined
  threshold (default: 3+ `Non-Compliant` records within 90 days) — a
  simple, documented heuristic, not ML; be upfront about that if asked

### Violation-Type Breakdown for This Manufacturer
- Uses the exact Canonical Violation Taxonomy from the README, scoped to
  this manufacturer — do not introduce different category names here

### Products Table
- All products scanned under this manufacturer: thumbnail, product name,
  scan date, Compliance Status, violation count — same column shape as
  Compliance Records, pre-filtered to one manufacturer

### Actions
- View Full History (expands audit detail per product)
- Flag for Enforcement — per the Role Permission Matrix, Enforcement
  Officer and Admin only
- Export Scorecard (PDF, feeds into Reports page 10)

## 3. User Flow

1. User (Admin, Enforcement Officer, or Reviewer) arrives from a Dashboard
   alert, an Analytics drill-down, or direct search
2. Summary header and repeat-violation flag give an immediate read
3. User reviews trend and violation-type breakdown for context
4. User scans the products table, clicking into individual Product
   Compliance Detail pages as needed
5. User exports the scorecard or (if Enforcement Officer/Admin) flags the
   manufacturer for enforcement

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| Manufacturer with only one scan on record | Trend chart shows a single point with a note that trend requires more data |
| No repeat-violation threshold crossed | No flag shown — never a "clear" badge that could be mistaken for an official certification |
| Manufacturer name variations (spelling differences across scans) | Out of scope for MVP matching logic — note this as a known limitation |
| Zero products for a searched manufacturer name | "No records found for this manufacturer" with a suggestion to check spelling |
| Reviewer viewing this page | Full read access, export available; "Flag for Enforcement" hidden/disabled |

## 5. UX4G / Design Notes

- Reuse the exact same `Table` column shape as Compliance Records.
- The repeat-violation flag uses the `warning` or `error` status token
  based on actual severity — borrow the Dashboard's alert pattern.
- Rely on clear labeling ("3 Non-Compliant records in last 90 days") rather
  than heavy color washes to convey severity.

## 6. Definition of Done

- [ ] Repeat-violation threshold logic is explicit and documented (default:
      3+ Non-Compliant in 90 days)
- [ ] Products table reuses the same column shape as Compliance Records
- [ ] Single-scan manufacturers don't get a misleading trend line
- [ ] No manufacturer is shown a "clear/compliant" badge that could be
      mistaken for an official certification
- [ ] Violation-type breakdown matches the Canonical Violation Taxonomy
      exactly
- [ ] "Flag for Enforcement" is hidden/disabled for Reviewer role
- [ ] Export Scorecard action correctly routes to/pre-fills Reports

## 7. Claude Design Prompt

```
Build the Manufacturer Compliance Scorecard page inside our existing app
shell. This is a USP feature — it reframes our compliance data around
manufacturers, the actual unit enforcement decisions are made against.

Reuse existing components: Table (same column shape as Compliance Records),
status Badge/Tag/Chip (colored from Text/Status/* tokens), Card, Button,
chart components. Do not create new one-off styling — if an existing
component doesn't fit, tell me before improvising.

Sections needed:
- Manufacturer search/select with autocomplete
- Summary header: manufacturer name, total products scanned, overall
  compliance rate, first-scanned date, most recent scan date
- Compliance rate over time (line chart)
- Repeat-violation flag: prominent indicator when a manufacturer crosses a
  defined threshold (default: 3+ Non-Compliant records within 90 days,
  documented clearly as a simple configurable rule, not ML)
- Violation-type breakdown using exactly these 10 categories, worded
  exactly like this: Manufacturer/Packer/Importer Details Missing, Generic
  Name Missing or Incorrect, Net Quantity Missing or Incorrect,
  Manufacture/Import Date Missing, MRP Non-Compliance, Country of Origin
  Missing, Consumer Care Details Missing, Font Size / Readability Failure,
  Non-Standard or Misleading Format, Other
- Products table: same columns as Compliance Records (thumbnail, product
  name, scan date, Compliance Status, violation count), filtered to this
  manufacturer
- Actions: View Full History, Flag for Enforcement (Enforcement Officer and
  Admin roles only — hide or disable for Reviewer), Export Scorecard
  (routes to/pre-fills the Reports page)

States to implement explicitly:
1. Manufacturer with only one scan — trend chart shows a single point with
   a note that trend requires more data, not a misleading flat line
2. No repeat-violation threshold crossed — show no flag; never show a
   "clear" or "compliant" badge that could be mistaken for an official
   certification
3. Zero products found for a searched manufacturer name — explicit "No
   records found" message

Avoid conveying severity through heavy color washes alone — use clear text
labels alongside the appropriate status token.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
