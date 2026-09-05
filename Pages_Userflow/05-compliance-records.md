# Page 5 — Compliance Records

> See `00-README.md` for the Status Model, Role Permission Matrix, and Fixed
> Vocabulary this file assumes. Fixed in this revision: role references now
> use full names ("Enforcement Officer" and "Admin," never "Officer"
> shorthand), matching the Role Permission Matrix exactly.

## 1. Purpose & Why It Matters

This is the "repository of scanned products and compliance history" your PS
explicitly requires. It's also the page every other page's links point to
(KPI cards, alerts, chart drill-downs), so its filtering needs to actually
support arriving pre-filtered from six different entry points, not just
manual search.

## 2. Sections & Fields

### Search Bar
- Search by product name, manufacturer, or scan ID

### Filters
- Date range
- Category
- Compliance Status (Pending / Compliant / Non-Compliant / Needs Review)
- Region
- Manufacturer
- Source (Officer-Scanned / Citizen-Reported / E-commerce-Sourced)
- Filters remain visible (not collapsed behind a single button), and each
  active filter shows as a visible, individually removable chip

### Sort
- Newest/oldest, alphabetical, status, relevance (when searching)

### Records Table
- Thumbnail, product name, manufacturer, scan date, Compliance Status pill,
  violation count, source tag, last updated

### Pagination
- Page size control, next/previous, current page indicator

### Actions (per row)
- View → Product Compliance Detail (page 6)
- Re-scan → back to Scan/Upload with this product's metadata pre-filled
- Generate Report → page 10, pre-filtered to this record
- Archive — per the Role Permission Matrix, Admin only

### Bulk Actions
- Select multiple rows → bulk export, bulk status change — per the Role
  Permission Matrix, Admin only

## 3. User Flow

1. User arrives either via direct navigation or a deep link carrying a
   pre-applied filter (e.g. from a Dashboard KPI click)
2. If arriving pre-filtered, the relevant filter chip is already visible
   and active
3. User refines with search/additional filters/sort as needed
4. User clicks View on a row to open full detail, or uses row actions
   directly from the table
5. User can clear all filters with one action to return to the unfiltered
   full list

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| No records match filters | Empty state with the active filters shown and a one-click "Clear filters" action |
| Loading | Skeleton rows, not a spinner replacing the whole table |
| Arriving pre-filtered from another page | Active filter chip pre-populated |
| Bulk action attempted with no rows selected | Bulk action controls disabled until at least one row is selected |
| Bulk/Archive actions viewed by a non-Admin role | Controls hidden or disabled per the Role Permission Matrix, not just unlabeled |
| Very large result sets | Pagination performs correctly; result-count indicator ("Showing 1–20 of 3,412") |

## 5. UX4G / Design Notes

- Reuse the shared `Table` component exactly as built in Phase 0 — this
  page is the canonical use case that component was designed for; extend
  the shared component if needed, don't fork it here.
- Filter chips need visible focus/remove targets meeting the 44x44px
  minimum.
- Status pills use the fixed Compliance Status vocabulary — this table is
  the single place in the app where all four statuses appear side by side
  most often, so inconsistency here is the most visible place it could show.

## 6. Definition of Done

- [ ] All 7 filter types implemented and individually removable via chips
- [ ] Table correctly reflects a pre-applied filter when arriving via deep
      link from Dashboard/Analytics/Scorecard
- [ ] Empty-result state offers a clear-filters action
- [ ] Archive and bulk actions are gated to Admin only, per the Role
      Permission Matrix — hidden/disabled for Enforcement Officer and
      Reviewer, not just left clickable-but-nonfunctional
- [ ] Pagination and result count behave correctly at scale

## 7. Claude Design Prompt

```
Build the Compliance Records page inside our existing app shell.

Reuse existing components: Table, status Badge/Tag/Chip (colored from
Text/Status/* tokens), Input, Select, Button. Do not fork the Table
component for this page — if it needs new capability, extend the shared
component and tell me what changed.

Sections needed:
- Search bar: product name, manufacturer, or scan ID
- Filters (all visible at once, not collapsed): date range, category,
  Compliance Status, region, manufacturer, source. Each active filter shows
  as an individually removable chip. Include a single "Clear all filters"
  action.
- Sort: newest/oldest, alphabetical, status, relevance
- Records table columns: thumbnail, product name, manufacturer, scan date,
  Compliance Status pill, violation count, source tag, last updated
- Row actions: View, Re-scan, Generate Report, Archive
- Bulk actions: select multiple rows → bulk export, bulk status change

Role gating (per our Role Permission Matrix — use full role names, never
shorthand): Archive and both bulk actions are Admin-only. Hide or disable
these controls for Enforcement Officer and Reviewer roles rather than
showing them non-functionally. Bulk action controls are additionally
disabled until at least one row is selected, even for Admin.

This page needs to correctly render when arriving via a deep link with a
pre-applied filter (e.g. status=Non-Compliant from a Dashboard KPI click) —
build the filter state to support being set programmatically on page load,
not only via manual UI interaction.

States to implement explicitly:
1. No records match current filters — empty state showing active filters
   plus a one-click clear action
2. Loading — skeleton rows, keep filters/headers visible during load
3. Bulk action controls disabled with zero rows selected

Use our fixed status vocabulary exactly: Pending / Compliant / Non-Compliant
/ Needs Review. Use our fixed source vocabulary exactly: Officer-Scanned /
Citizen-Reported / E-commerce-Sourced.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
