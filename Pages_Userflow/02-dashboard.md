# Page 2 — Dashboard (+ Shared App Shell)

> See `00-README.md` for the Status Model, Canonical Violation Taxonomy,
> Role Permission Matrix, and Fixed Vocabulary this file assumes. Fixed in
> this revision: the "Pending Review" KPI is renamed to "Pending" to match
> the fixed status vocabulary exactly, and now has a precise meaning (see
> below). This is also where the shared Sidebar/Header shell gets built,
> since this is the first authenticated page.

## 1. Purpose & Why It Matters

This is the command center and, in a demo setting, the first real screen a
judge sees after login. Every KPI and alert here summarizes data generated
by later pages, so getting the data's *shape* right now — using the exact
Compliance Status values, not approximations — saves rework later. This
page also establishes the Sidebar/Header shell every subsequent
authenticated page will reuse.

## 2. Sections & Fields

### Shared App Shell (build once, here)
- **Sidebar**: nav items for all 8 authenticated pages (Dashboard, Scan/
  Upload Product, Extraction & Verification, Compliance Records, Product
  Compliance Detail, Analytics & Violation Trends, E-commerce Listing
  Scanner, Manufacturer Scorecard, Reports & Profile — note Product
  Compliance Detail is usually reached via a record, not a direct nav item,
  so it may not need its own sidebar entry), with an active-item highlight
  state
- **Header**: page title, user name + role badge, notifications icon with
  unread count, profile/logout menu

### KPI Cards (4-up)
- **Products Scanned** — total count, delta vs. previous period
- **Compliant** — count + percentage of total
- **Non-Compliant** — count + percentage of total
- **Pending** — count of records where Compliance Status = Pending (i.e.
  Verification Status is still Extracted, not yet Verified) — this KPI
  literally means "awaiting verification," not a vague backlog number
- Each card: label → large bold value → delta with a text label ("+12% vs
  last week"), not an arrow/color alone
- Clicking a KPI navigates to Compliance Records pre-filtered to that status

### Compliance Trend Chart
- Line or bar chart: Compliant vs. Non-Compliant scans over time (weekly or
  monthly toggle)
- Optional: overlay total scan volume so trend and workload are visible
  together

### Recent Scans List
- Product thumbnail, product name, scan date, Compliance Status (icon +
  label), source tag (Officer-Scanned / Citizen-Reported / E-commerce-
  Sourced), "View" action
- Capped at 5–8 rows with a "View all" link to Compliance Records

### Alerts
- Violation spikes (e.g. "MRP Non-Compliance up 40% this week" — use the
  canonical taxonomy wording)
- Repeat-offender flags (ties forward to Manufacturer Scorecard, page 9)
- Each alert deep-links to the relevant filtered Records view or Scorecard

### Quick Actions
- Scan New Product → page 3
- Scan E-commerce Listing → page 8
- View Records → page 5
- Generate Report → page 10

## 3. User Flow

1. User lands on Dashboard immediately after login
2. Cards show loading skeletons while data fetches
3. User scans KPIs and alerts for anything requiring immediate attention
4. User clicks a KPI/alert to drill into filtered Records, or uses a Quick
   Action to start a new task
5. Dashboard refreshes on return (e.g. after completing a scan elsewhere)

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| Initial load | Skeleton loaders on every card/chart/list — never a blank page |
| No data yet (new deployment) | Empty-state illustration + copy ("No scans yet — start your first scan") with a direct Quick Action |
| API error on one widget | That widget shows a retry state; the rest of the dashboard still renders |
| Alert list empty | "No active alerts" message |
| Very large numbers | KPI values format sensibly (e.g. 12.4K) |

## 5. UX4G / Design Notes

- Reuse `MetricCard`, `Table` (compact mode for Recent Scans), status
  `Badge`/`Tag`/`Chip` (colored from `Text/Status/*` tokens), and `Card`
  from the shared library — this page has the widest component variety of
  any page, so it's a good early stress test of the token system.
- Status pills use the exact Compliance Status vocabulary: Pending /
  Compliant / Non-Compliant / Needs Review — never paraphrase.
- Alert severity maps to the correct status token (info/warning/error)
  based on actual severity — don't default everything to `error`.
- Chart colors come from data-viz role tokens, never invented hex values.

## 6. Definition of Done

- [ ] Sidebar includes all authenticated pages with correct active-state
      highlighting
- [ ] All 4 KPI cards clickable, routing to correctly pre-filtered Records
- [ ] "Pending" KPI specifically counts unverified records, matching the
      Status Model in the README
- [ ] Loading skeleton implemented for every widget independently
- [ ] Empty state designed for a fresh deployment with zero data
- [ ] Alert severity uses the correct status token, not uniformly "error"
- [ ] Status vocabulary matches the README exactly across every widget

## 7. Claude Design Prompt

```
Build the Dashboard page, and build our shared app shell as part of this —
this is the first authenticated page, so the Sidebar and Header get
established here and every later page will reuse them.

Reuse existing components: MetricCard, Table, status Badge/Tag/Chip
(colored from Text/Status/* tokens), Card. Do not create new one-off
styling — if an existing component doesn't fit, tell me before
improvising.

Shell:
- Sidebar: nav items for Dashboard, Scan/Upload Product, Compliance
  Records, Analytics & Violation Trends, E-commerce Listing Scanner,
  Manufacturer Scorecard, Reports & Profile, with an active-item highlight
- Header: page title, user name + role badge, notifications icon with
  unread count, profile/logout menu

Dashboard sections:
- 4 KPI cards: Products Scanned, Compliant, Non-Compliant, Pending — each
  with a text-labeled delta, each clickable to a pre-filtered Compliance
  Records route. "Pending" specifically means "awaiting verification" —
  make sure its wording/tooltip reflects that, not a generic backlog number.
- Compliance trend chart (Compliant vs Non-Compliant over time, weekly/
  monthly toggle)
- Recent Scans list: thumbnail, product name, date, status pill, source tag
  (Officer-Scanned / Citizen-Reported / E-commerce-Sourced), View action,
  capped at 8 rows with "View all" link
- Alerts section: violation spikes (using our canonical violation
  taxonomy wording) and repeat-offender flags, each deep-linking to
  filtered Records or the Manufacturer Scorecard
- Quick actions: Scan New Product, Scan E-commerce Listing, View Records,
  Generate Report

States to handle explicitly:
1. Initial loading — skeleton loaders per widget, not a blank page
2. Empty state (zero data) — illustration + direct call to action
3. One widget's API error — retry on that widget only, don't blank the
   whole dashboard
4. Empty alerts list — explicit "No active alerts" message

Use our fixed status vocabulary exactly: Pending / Compliant / Non-Compliant
/ Needs Review. Don't paraphrase. Alert severity should map to the correct
status token (info/warning/error) based on actual severity.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
