# PAGE_COMPOSITION.md
### Layout, grid, and visual hierarchy specification — Lead Visual Designer pass

This is the missing middle layer between tokens (`DESIGN_SYSTEM.md`) and components (`COMPONENT_SPEC.md`): how to actually *compose* a page so it reads as deliberately designed rather than assembled. Every measurement below resolves to the real UX4G grid (`DESIGN_SYSTEM.md` §8) and real spacing/typography tokens — nothing here introduces a new unit system.

---

## 0. Universal compositional principles

These apply to every page, before the per-archetype specs below.

### Grid discipline
Every element's left/right edge lands on a column line. No element is centered "by eye" or offset by an arbitrary margin that isn't a token. The four grids, restated for quick reference during layout work:

| Breakpoint | Columns | Gutter | Margin | Max content |
|---|---|---|---|---|
| Mobile (0–1023) | 4 | 12 | 16 | 768 |
| Tablet (1024–1439) | 8 | 16 | 24 | 960 |
| Desktop (1440–1767) | 12 | 24 | 32 | 1200 |
| Desktop XL (1768+) | 12 | 24 | 32 | 1320 |

A "6/12 split" means: left zone spans columns 1–6, right zone spans columns 7–12, separated by one gutter. All column-span numbers in this document are relative to these four grids.

### One focal point per viewport
Every screenful (not just every page) should have exactly one element the eye lands on first. Test it with the **squint test**: blur your eyes at the screenshot — if two elements compete for attention at the same visual weight, one of them needs to lose size, color intensity, or position. This is the single most common thing that separates "assembled from a component library" from "designed" — components alone don't establish hierarchy, composition does.

### Reading patterns
- **Z-pattern** for landing/marketing-style sections with a single clear goal: eye enters top-left (logo/eyebrow), sweeps right (primary nav or a supporting stat), diagonals down-left (heading, supporting text), lands bottom-right (primary CTA). Use for hero sections and any promotional block.
- **F-pattern** for content-dense, scanning pages (lists, detail pages, dashboards): eye moves left-to-right across the top, drops down, makes a shorter left-to-right sweep, drops down again, then scans the left edge vertically. Put the most important label/value in every row on the **left**, not centered — this is why UX4G table/list components lead with the primary identifier column.
- Government users are usually task-driven, not browsing — default to F-pattern (get-to-content-fast) over Z-pattern (persuade-then-convert) except on the homepage's hero, where Z-pattern is appropriate because the homepage's actual job is wayfinding/persuasion, not task completion.

### The 60/30/10 rule, applied to tokens
Roughly 60% of any viewport should read as neutral background/surface (`Background/Neutral/Default`, `Elevated`), ~30% as secondary surface/text weight (`Background/Neutral/Soft`, `Text/Neutral/Secondary`, borders), and ~10% or less as brand-primary or status color doing real signaling work (primary CTA, active nav state, key metric, status badge). A screen where brand purple appears in more than ~10% of the visible area is wash, not accent — dial it back to the elements that are genuinely primary actions or identity markers (see `DESIGN_SYSTEM.md` §10's color-usage discipline).

### Whitespace is a hierarchy tool, not leftover space
Larger gaps signal "these things are unrelated"; smaller gaps signal "these things are a group." Never use one flat spacing value between every element on a page — use the `Stack/*` scale (`DESIGN_SYSTEM.md` §5) deliberately: `Stack/XS`/`S` within a tight group (label + value), `Stack/M`/`L` between related elements in a card, `Section/*` between page sections. If two things are visually the same distance apart as two unrelated things, the layout has no hierarchy regardless of how good the components look individually.

### CTA discipline
Exactly one `Action/Brand/Primary` (filled) button per screen section. Every other action in the same viewport is `Secondary` (outlined), `Tertiary` (text/link), or `Tonal`. A screen with two filled primary buttons has no hierarchy — the user can't tell which action you actually want them to take, which is a compositional failure, not a components failure.

### Optical alignment over mathematical alignment
When a large heading and a small badge/icon sit on the same row, mathematically-centered vertical alignment often looks *lower* than it should due to text cap-height vs. icon bounding-box differences — nudge by 1–2px where needed rather than trusting the CSS default blindly. This is a finishing-pass detail, not a first-draft concern, but it belongs in the QA loop (`VISUAL_QA_LOOP.md`).

---

## 1. Homepage / Landing

**Compositional goal:** wayfinding + trust establishment in under 5 seconds. A government homepage's job is "tell me this is legitimate and get me to the right service fast" — not persuasion in the marketing sense.

**Above-the-fold priority (both mobile and desktop):** service name/identity, one clear primary action (e.g., "Apply," "Track your application," "Find a service"), and enough visual trust signal (official emblem/masthead per GIGW, not a generic hero photo) that a first-time visitor doesn't doubt legitimacy. If BRD §5's P1 journey is "apply for X," the homepage's primary CTA is that action — not a generic "Learn more."

| Zone | Desktop (12-col) | Tablet (8-col) | Mobile (4-col) |
|---|---|---|---|
| Masthead/utility bar (language switcher, accessibility bar, emblem) | full width | full width | full width |
| Navbar | full width | full width | full width, collapses to menu icon |
| Hero | text 1–6, media/illustration 7–12 | text 1–8 (stacked above media) | full width, stacked: text first, then supporting visual |
| Service cards / key actions | 3-up, each spans 4 | 2-up, each spans 4 | 1-up, full width |
| Stats/trust band (if BRD has metrics — applications processed, users served) | 4-up, each spans 3 | 2×2, each spans 4 | 1-up, full width |
| Content sections (announcements, news) | 2-up, each spans 6, OR 8+4 sidebar split | full width stacked | full width stacked |
| Footer | full width | full width | full width |

**Section sequence & vertical rhythm:** Masthead → Navbar → `Section/XL` gap → Hero → `Section/L` gap → Service cards → `Section/L` gap → Stats band (if present) → `Section/XL` gap → Content sections → `Section/XL` gap → Footer. Hold this spacing constant; don't let one section's designer tighten the gap "because it felt cramped" — fix the content, not the rhythm.

**Hero height discipline:** do not build a 100vh hero. This is a marketing-site convention that actively works against a task-driven government site — it pushes the actual useful content (services, actions) below the fold for no benefit. Target hero height ≈ 60–70% of viewport on first load at most, less on mobile (a mobile hero should never consume the entire first screen with nothing else visible).

**Typography per zone:** Hero heading `Display/S` or `Display/XS` desktop, stepping to `Heading/XXL` on mobile (a `Display` size at mobile width usually wraps awkwardly — step down, don't just reflow). Section headings `Heading/L`. Card titles `Title/M`. Body copy `Body/M`.

**Background rhythm:** alternate `Background/Neutral/Default` and `Background/Neutral/Elevated` (not `Soft`, per the Dark-mode collision warning in `DESIGN_SYSTEM.md` §7) between adjacent sections so the eye registers section boundaries without needing a hard divider line every time.

**Don't:** stack more than 3 competing CTAs above the fold; use a full-bleed brand-color hero background (10% rule); center-align long paragraphs (ragged-right, left-aligned only).

---

## 2. Service / Scheme Detail page

**Compositional goal:** answer "am I eligible, what do I need, how do I apply" in a scannable sequence — this is an information page, not a persuasion page.

| Zone | Desktop | Tablet | Mobile |
|---|---|---|---|
| Breadcrumb | full width | full width | full width |
| Title block + primary CTA | 1–8 content, CTA anchored top-right on desktop | full width, CTA below title | full width, CTA below title, full-width button |
| Body content + sidebar | content 1–8, sidebar (key facts: eligibility summary, deadline, department) 9–12 | content full width, sidebar below as a card, not a true sidebar | content full width, sidebar collapses to a card immediately after the title block |
| Tabbed/sectioned detail (Eligibility, Documents, Process, FAQs) | `Tab` component, content 1–8 | same, full width | `Accordion` instead of `Tab` — tabs don't scale to mobile width past 3–4 short labels |
| Related services | 3-up cards, each spans 4 | 2-up | 1-up |

**Hierarchy notes:** F-pattern applies throughout. The sidebar's key facts (deadline, fee, eligibility one-liner) are the highest-value scan target on the page for a returning user who already knows roughly what this service is — treat that sidebar card as the second focal point after the title, not a throwaway.

**Typography:** Page title `Heading/XL`. Section headings within the tabs `Heading/S`. Body `Body/M`. Sidebar labels `Label/L`, sidebar values `Body/M` bold or `Title/S`.

**Don't:** bury the primary CTA ("Apply now") below a long eligibility essay — repeat it at both the top (with the title) and the bottom (after the full detail), so a confident returning user isn't forced to scroll through content they don't need.

---

## 3. List / Search Results page

**Compositional goal:** scan many items fast, filter/narrow efficiently, act on one.

| Zone | Desktop | Tablet | Mobile |
|---|---|---|---|
| Page title + result count | full width | full width | full width |
| Filter sidebar + results | sidebar 1–3, results 4–12 | filters collapse into a `Drawer` triggered by a "Filters" button above the results; results full width | same as tablet |
| Search bar | inline within the filter/results header row | full width above results | full width above results |
| Result rows/cards | `Table`/`Result List`, full width of the 4–12 zone | full width | 1-up cards — abandon table layout below tablet width, don't force horizontal scroll on a data table |
| Pagination | bottom, left-aligned under results (F-pattern — don't center it) | same | same, or "Load more" if the result set is long and pagination controls would be fussy on touch |

**Hierarchy notes:** within each result row, the single most decision-relevant field (usually name/title) is leftmost and heaviest weight (`Body/M` bold or `Title/S`); status is a `Badge`/`Tag`, never plain colored text alone (10% rule + WCAG 1.4.1 — color can't be the only signal, per `ACCESSIBILITY_AND_QA.md` A-10). Secondary metadata (date, reference number) is `Body/S`, `Text/Neutral/Tertiary`.

**Don't:** put filters in a sidebar on mobile by just shrinking the desktop sidebar to a narrow column — collapse them into a `Drawer`/`Modal`, full stop, per `DESIGN_SYSTEM.md` §8's breakpoint-naming trap (don't assume "Tablet" gets desktop treatment).

---

## 4. Form / Multi-step application flow

**Compositional goal:** reduce cognitive load to one decision at a time. This is the page type most damaged by generic "modern" composition (multi-column forms, decorative side panels) — the correct composition for a form is *narrow and linear*.

| Zone | Desktop | Tablet | Mobile |
|---|---|---|---|
| Stepper (progress) | full width or 1–8 centered, above the form | same | same, condensed to "Step 2 of 5" text if the full `Stepper` visual doesn't fit 4 columns cleanly |
| Form content | **single column, 3–8** (not full 12 — a full-width form on a 1440px screen produces uncomfortably long input widths and a wandering eye) | 2–7 | full width |
| Field groups | one `Form Field` per row for anything requiring careful reading (Aadhaar, PAN, address); two short fields may share a row (e.g. City + Pincode) only when both are short and clearly paired | same, allow slightly more 2-up pairing given more width | always 1 field per row |
| Navigation (Back / Save Draft / Continue) | bottom of form, Continue is the one `Action/Brand/Primary`, Back is `Secondary`, Save Draft is `Tertiary` | same | same, full-width stacked buttons with Continue on top |

**Hierarchy notes:** this is the one page type where the Z-pattern's "sweep to a bold CTA" instinct should be resisted — a form's primary CTA (`Continue`) should be *found reliably in the same place every step*, not made dramatic. Consistency beats emphasis here.

**Don't:** put a decorative illustration or marketing copy beside the form "to make it feel less bare" — an empty margin is correct on a form page; filling it with unrelated content adds a second focal point that competes with the actual task, which is the opposite of what a form needs.

---

## 5. Dashboard (citizen account or admin/analytics)

**Compositional goal:** at-a-glance status, then progressive detail on demand. Composed from `MetricCard`/`DashboardPanel`/`ApplicationTracker` (`COMPONENT_SPEC.md` §3).

| Zone | Desktop | Tablet | Mobile |
|---|---|---|---|
| Metric row | 4-up, each spans 3 | 2×2, each spans 4 | 1-up stacked, or a horizontally-scrollable row if BRD density is "dense admin" rather than "citizen glance" |
| Primary panel (chart, tracker, or largest table) + secondary panel | 8+4 split | full width stacked, primary panel first | full width stacked |
| Secondary panels (2 more, e.g. activity feed + notifications) | 2-up, each spans 6, OR one full-width if content is a list | full width stacked | full width stacked |
| Data table (if admin) | full width below the panel row | full width, consider a card-per-row fallback below tablet if the table has >5 columns | card-per-row, never a horizontally-scrolled dense table on mobile |

**Hierarchy notes:** exactly one panel should read as "the main event" of the dashboard (largest, first in reading order, highest information density) — everything else is supporting. Don't give every panel equal visual weight; that's the classic "generic dashboard" tell (see `DESIGN_SYSTEM.md` §10's elevation-consistency rule — equal weight is fine *within* a tier, but there should be a tier).

**Metric row composition specifically:** each `MetricCard`'s internal hierarchy is label (`Label/L`, quiet) → value (`Heading/M`/`Heading/L`, the loudest thing in the card) → delta (`Body/S`, quiet, color only from `Text/Status/*`). The value must be visually the dominant element of its card by a wide margin — if the label and the value are close in visual weight, the card reads as a form field, not a metric.

**Background rhythm:** use `Background/Neutral/Elevated` for every panel/card, sitting on `Background/Neutral/Default` page background — hold this constant across every panel on the page; don't vary elevation per-panel unless you're deliberately signaling a hierarchy tier (see above).

**Don't:** default to a 4-across metric row on every dashboard regardless of content — if there are 6 metrics that matter, a 3×2 or a 2×3 grid reads better than cramming 6 into "4-up wraps to 2." Choose column count from the actual metric count, not from habit.

---

## 6. Application Tracker

**Compositional goal:** answer "where is my thing right now" instantly, with history available on demand, not upfront.

| Zone | Desktop | Tablet | Mobile |
|---|---|---|---|
| Application summary (ref number, service name, submitted date) | full width header band | full width | full width |
| `Status Pipeline` (current stage, prominent) | 1–8, centered emphasis | full width | full width |
| `SLA Progress Indicator` (if applicable) | 9–12, beside the pipeline | below the pipeline, full width | below the pipeline, full width |
| `Journey Timeline` (history) | full width, below, collapsed to last 2–3 events with "show full history" expand | same | same |
| Actions (download receipt, contact support, escalate) | inline row below timeline | stacked or wrapped row | stacked full-width buttons |

**Hierarchy notes:** the current stage in the `Status Pipeline` is the single loudest element on the page — it should be identifiable in under 1 second without reading any label, through position, color (status token), and size alone. History is secondary and should be collapsed by default for anything beyond 2–3 steps; a fully-expanded 8-step timeline on first load buries the one thing the user came for (current status) under history they probably don't need right now.

---

## 7. Confirmation / Success page

**Compositional goal:** confirm unambiguously, provide the reference/next step, get out of the way. This is the shortest, calmest page in the product — resist the urge to decorate it.

**Composition:** single centered column, 4–9 on desktop (narrower than a form page — this page has almost no content). Success indicator (icon + `Heading/L` confirmation message) → reference number in a distinct `Card` (this is the one thing the user needs to save/screenshot, give it real visual weight) → next-step guidance (`Body/M`) → primary action (`Action/Brand/Primary` — usually "Track your application" or "Return to dashboard") → secondary action (`Tertiary` — "Download receipt").

**Don't:** add unrelated cross-sell content ("You might also be interested in...") — a government confirmation page's job ends at confirming; padding it with other-service promotion undermines the trust this exact moment is built on.

---

## 8. Empty state / Error / 404

**Compositional goal:** never leave a blank screen; always give a way forward.

**Composition:** UX4G `Empty State` component, centered, single column 4–7 on desktop. Icon/illustration (not a large photo) → `Title/M` short explanation → `Body/M` one-sentence elaboration if needed → one clear action (`Secondary` weight is usually right here, not `Primary` — an error page's action is a recovery path, not the product's main goal).

**Don't:** use humor or informal copy on a government 404/error page — match the institutional tone BRD §11.2 establishes elsewhere, even here.

---

## 9. Admin / data-dense view

**Compositional goal:** maximum legible information density for a trained, repeat user — this is the one page type where "minimal" gives way to "efficient," deliberately.

**Composition:** toolbar (search, filter, bulk actions) full width → `Table` full width, `Padding/S`/`M` row density (tighter than citizen-facing tables, per the density decision in `DESIGN_SYSTEM.md` §10) → `Pagination`. Sidebar navigation (admin section nav) is legitimate here even where it wasn't on citizen-facing pages, because admin users return repeatedly and benefit from persistent wayfinding a first-time citizen visitor doesn't need.

**Don't:** apply the same generous whitespace/padding used on citizen-facing marketing-adjacent pages to an admin table — that's optimizing for the wrong thing at this density; an admin screen with `Padding/XL` row height wastes the screen real estate its actual users need.

---

## 10. Cross-page consistency checklist

Before considering any set of pages done, verify:

```
□ Same card elevation/radius/padding tokens used for the "same kind of thing"
  across every page (a MetricCard looks like a MetricCard everywhere)
□ Same spacing rhythm (Section/Stack scale) between analogous zones on every page
□ Same button hierarchy rule holds everywhere — one Primary per screen, no exceptions
□ Same background rhythm (Default/Elevated alternation) — no page suddenly
  introduces a third surface tone that isn't used elsewhere
□ Typography scale used consistently — a Heading/L on one page isn't doing the
  same job as a Heading/M on another
□ Reading pattern (Z for hero/landing, F for content/lists) applied consistently
  by page type, not mixed arbitrarily
```
