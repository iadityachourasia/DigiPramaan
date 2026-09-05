# COMPONENT_SPEC.md
### UX4G component inventory + composed recipes for this project

All components below come from `ux4g-web-components@2.0.1` (npm) or CDN `UX4G@3.1.0`. Inherits token rules from `DESIGN_SYSTEM.md` — nothing here introduces a class, color, or token not already documented there.

---

## 1. Class composition rule — restated because it's the most common mistake

Always write **base class + variant class + size class**, in that order:

```html
<button class="ux4g-btn ux4g-btn-primary ux4g-btn-md">Save</button>
```

This is safe under all three of UX4G's inconsistent internal models (base-required, base-optional-shared-selector, variant-only). Skipping the base class is the one habit that silently breaks — most notably `.ux4g-icon-btn-primary` without `.ux4g-icon-btn`, and any button inside `.ux4g-time-slot-weekly-actions`/`.ux4g-time-slot-compact-actions` without `.ux4g-btn`.

---

## 2. Component parity table (Design.md §12 — condensed to what's implementation-relevant)

Status: ✅ available in web package · ❌ confirmed absent (grepped from compiled CSS) · ❓ unverified

| Component | Web (CSS) | Notes |
|---|---|---|
| Button, Icon Button | ✅ | Base class required for Icon Button — see §1 |
| Link | ✅ | |
| Input, Textarea | ✅ | Base class required |
| Search | ✅ | |
| Checkbox, Radio, Switch | ✅ | Border contrast known-failing default — see DESIGN_SYSTEM §9, repoint before shipping |
| Dropdown, Combobox | ✅ | Runtime-driven (event-delegated behaviour) |
| Slider | ✅ | |
| Form Field | ✅ | Wraps label + hint + input + error — use this instead of hand-assembling the pattern |
| OTP | ✅ | Relevant if BRD specifies Aadhaar/mobile OTP auth |
| Date Picker | ✅ | |
| Input Aadhaar, Input PAN Card | ✅ | Government-specific — use these instead of a generic masked text input |
| File Upload | ✅ | Pair with BRD §10.6 (accepted formats, max size) |
| Card | ✅ | Base class required — the foundation for every composed recipe below |
| Badge, Tag, Chip, Chips Group | ✅ | No documented base-class rule — write variant class only, per current shipped CSS |
| Avatar, Image, Divider | ✅ | |
| Table, List, Result List | ✅ | |
| Empty State | ✅ | Use for every "no results"/zero-data case — never a hand-rolled message |
| Carousel | ✅ | Runtime-driven |
| Accordion, Tab | ✅ | Runtime-driven |
| Modal, Drawer | ✅ | Runtime-driven — focus trap + Escape-to-close included |
| Tooltip, Popover | ✅ | Runtime-driven |
| Alert | ✅ | Base class required. Use instead of any custom banner |
| Spinner, Progress Indicator | ✅ | Base class optional/shared for Spinner |
| Stepper, Pagination | ✅ | |
| Status Pipeline | ✅ | **Government-workflow specific** — use for multi-stage application/service status instead of a custom timeline |
| Journey Timeline | ✅ | Use for chronological process history (e.g. "application submitted → under review → approved") |
| SLA Progress Indicator | ✅ | Use for time-bound government service commitments |
| Draft Status | ✅ | Use for saved-but-not-submitted form states |
| Navbar, Footer, Breadcrumb, Mega Menu | ✅ | Runtime-driven (Mega Menu) |
| Accessibility Bar | ✅ | **GIGW-relevant** — check BRD §9/§12 for whether this is mandated; if the product must meet GIGW 3.0, this component is very likely required, not optional |
| Feedback | ✅ | |
| Social Link | ✅ | |
| Time Slot | ✅ | Contains the base-class gotcha documented in §1 |
| Bottom Sheet, Toast | ❌ | Not in web package (Flutter only) — do not attempt to import or fake these; use Modal/Drawer for bottom-sheet-like needs and Alert for toast-like needs |
| Mobile App Header, Receipt Card, Escalation Tree, Checklist, Biometric Capture, Add to DigiLocker | ❌ | Not in web package — flag to the user as a gap if BRD requires one of these; do not hand-build a look-alike without flagging first (§13 anti-pattern) |

**If a BRD requirement needs a ❌ component:** stop and flag the gap explicitly before writing custom markup, per Design.md §0.6 step 7. Do not silently hand-roll a replacement that looks like a UX4G component — that produces something that looks compliant but isn't, which is worse than an obviously custom element.

---

## 3. Composed recipes for common government-site patterns

These are compositions of existing UX4G components/tokens — **not new components**. Each recipe lists what to use and what token drives each part, so nothing gets hardcoded.

### MetricCard (dashboard / tracker summary)
- **Structure:** `ux4g-card` → label (`Label/L`, `Text/Neutral/Secondary`) → value (`Heading/M` or `Heading/L`, `Text/Neutral/Primary`, bold) → delta/trend (`Body/S`, colored via `Text/Status/Success` or `Text/Status/Error` depending on direction — never a raw green/red hex).
- **Elevation:** Level 1, consistent across every MetricCard on the page (see DESIGN_SYSTEM §10).
- **Padding:** `Padding/M` (dense/admin) or `Padding/L` (citizen-facing).
- **Where used:** dashboard summary rows, application-tracker "at a glance" panels.

### DashboardPanel (chart/list container)
- **Structure:** `ux4g-card` with a heading row (`Title/M`, since it's a bounded-surface heading, not document structure) + content slot.
- **Content options:** a real charting approach for any data visualization (do not use UX4G for chart rendering — it has none; BRD §11 tech-stack section may specify a chart library) styled to read tokens for its color values (status colors, brand primary) rather than hardcoded hex, so charts stay theme-correct in Dark mode.
- **Where used:** any analytics, reporting, or admin overview screen.

### ApplicationTracker (citizen-facing status view)
- **Structure:** `Status Pipeline` (current stage) + `Journey Timeline` (history of stage transitions, each entry with timestamp) + `SLA Progress Indicator` (if the service has a committed turnaround time) + `Draft Status` badge if the application is saved-not-submitted.
- **Why not build a custom timeline:** this exact pattern is why these four components exist in UX4G — a custom-built version is both an anti-pattern (§13 in DESIGN_SYSTEM.md) and loses the accessibility work already done in the shipped components.
- **Where used:** any "track my application/grievance/request" page — a near-universal government product need.

### DataTable with status (admin list / order list / application list)
- **Structure:** `ux4g-table` or `Result List` → status column uses `Badge`/`Tag`/`Chip` colored from `Text/Status/*` tokens, never a raw hex → `Empty State` component for the zero-rows case → `Pagination` component, never hand-built page-number buttons.
- **Row density:** one Padding-token decision, held constant for the whole table (DESIGN_SYSTEM §10).
- **Where used:** admin dashboards, "my applications" list, any tabular government data.

### FormSection (any government form — application, registration, grievance)
- **Structure:** `Form Field` component per input (wraps label + hint + input + error, so the WCAG label/hint/error-association work is inherited, not rebuilt) → `Input Aadhaar`/`Input PAN Card` for those specific government ID types instead of a generic masked input → `File Upload` for document attachment, wired to BRD §10.6's accepted-format/max-size rules → `OTP` component if BRD §10.2 specifies OTP auth.
- **Validation:** error message pattern must name the problem and state the fix (BRD A-07 / WCAG 3.3.1) — "Enter your date of birth as DD/MM/YYYY," never "Invalid date."
- **Border contrast:** repoint input/checkbox/radio borders per DESIGN_SYSTEM §9 before shipping — this is the known blocker, not optional polish.

### NotificationList / ActivityFeed (if the product has one — dashboard or citizen account area)
- **Structure:** `List`/`Result List` component, one row per item: `Avatar`/`Icon` leading element + two-line text stack (`Body/M` primary line, `Body/S`/`Text/Neutral/Tertiary` meta line) — this is a plain composition of List + typography tokens, no bespoke component needed.

### Alert / Banner (system-wide or page-level messaging)
- **Structure:** `Alert` component, base class required. Use for time-sensitive notices, form-level errors, success confirmations — never a custom-styled `<div>` banner (this is explicitly named as an anti-pattern in Design.md §13: "custom banners → Status Banner or System Alert").
- **GIGW-mandated banner content** (BRD §9.4): copyright, accessibility statement link, privacy policy link, RTI link, last-updated date belong in `Footer`, not `Alert` — don't conflate the two.

### Navigation shell (Navbar + Footer + Breadcrumb)
- **Structure:** `Navbar` (sticky, per BRD if specified) + `Breadcrumb` for any page beyond one level deep + `Mega Menu` if the sitemap (BRD §6.1) has enough sections to warrant it + `Footer` carrying all BRD §9.4 mandatory content + `Accessibility Bar` if GIGW compliance requires it (check BRD §1.3/§12).

---

## 4. Gap register

Track anything a BRD requirement needs that UX4G doesn't ship, so it's visible rather than silently worked around:

| Need | UX4G status | Action |
|---|---|---|
| Toast notifications (web) | ❌ absent | Use `Alert` positioned as a dismissible banner instead; do not import the Flutter-only Toast pattern or hand-build a toast look-alike without flagging it to the user first |
| Bottom Sheet (web) | ❌ absent | Use `Drawer` (bottom-anchored) or `Modal` instead |
| Receipt Card, Escalation Tree, Checklist, Biometric Capture, Add to DigiLocker | ❌ absent (web) | Flag explicitly if BRD requires one; these exist in Figma/Flutter but not the shipped web package — this is a real gap, not an oversight to route around silently |
| Chart/graph rendering | Not a UX4G component category at all | Use a real charting library per BRD's tech-stack section, styled from UX4G color tokens (see DashboardPanel recipe) |
| Fourth "accent" color beyond primary/secondary/tertiary | Not a token category | This is a BRD §11.3 decision — do not improvise one from the status palette (DESIGN_SYSTEM §10) |
