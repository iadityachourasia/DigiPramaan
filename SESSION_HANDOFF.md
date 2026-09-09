# Digi-Pramaan — Session Handoff

**Purpose of this file:** everything a fresh Claude Code session needs to
continue this build with zero prior context — not what the *system* is
(that's `BACKEND_HANDOFF.md`), but where the *work* stands, how this
project has actually been built turn by turn, and what happens next.

**Read this file first in a new session.** Then read `CLAUDE.md` (build
non-negotiables) and, if backend work is the ask, `BACKEND_HANDOFF.md`
(the complete current-state document — data model, API surface, mock-vs-
real gap list, recommended architecture).

**Repository state at time of writing:** branch `master`, HEAD `885808c`
("Build the five statutory footer pages (GIGW 3.0)"), working tree clean.

**Full commit history, oldest first** (for orientation — each is a real,
working checkpoint that passed `npm run verify` + tests before being
committed):

```
927d5c5  Baseline: Phase 1 foundation plus route scaffolding
0ee0e92  Repair design-token regressions and clear the verify gate
7510012  Add the public landing page, and lift auth above both route groups
2431d9f  Build the Login page with all seven states, and fix a hidden-error bug
cd1d994  Role-gate the shell navigation, and fix invisible icons app-wide
ff29ddc  Build the Dashboard page, and fix two colour bugs it exposed
e846440  Build Scan/Upload through Product Compliance Detail (pages 3-6)
08cf3f9  Build Analytics & Violation Trends (page 7)
0ac8c45  Build the E-commerce Listing Scanner and Manufacturer Scorecard (pages 8-9)
5cc5a20  Build Reports & Profile with real PDF and DOCX generation (page 10)
105a671  Build the Citizen Grievance Portal (page 11)
f7ef9d3  Route every mutation through one central activity log
ee639f4  Build the Global Activity Log (13 §3.2)
9860d1c  Add BACKEND_HANDOFF.md, a zero-context backend handoff document
ed5ceba  Add jurisdiction-scoped visibility across Records, Analytics and Scorecard (13 §4)
735d9ff  Add SESSION_HANDOFF.md for resuming this build in a fresh session
885808c  Build the five statutory footer pages (GIGW 3.0)   ← HEAD
```

---

## 1. What this project is

Digi-Pramaan (SIH26034) — a Government of India Legal Metrology Compliance
System. Built on **UX4G Design System v3** (mandatory, no exceptions — see
`CLAUDE.md` and the `ux4g-design` skill at `.claude/skills/ux4g-design/`).
Next.js 16.3.4 App Router, TypeScript strict with
`exactOptionalPropertyTypes: true`, next-intl, UX4G components.

The product spec lives in `Pages_Userflow/*.md` — `00-README.md` is the
cross-cutting contract (status model, violation taxonomy, Role Permission
Matrix, build order); `01` through `11` are one file per page; `13` is the
"Addendum" covering extraction transparency, report export, history/audit,
and Hierarchical Management (jurisdiction). There is no `12` file.

## 2. Project structure, annotated

```
Digi-Pramaan/
├── CLAUDE.md                    # Build non-negotiables — read every session
├── BACKEND_HANDOFF.md           # What the system IS: full data model, every API
│                                 route's exact shape, mock-vs-real gap list,
│                                 recommended backend architecture. ~2600 lines.
├── SESSION_HANDOFF.md           # This file — how the work has progressed.
├── docs/
│   ├── Design.md                 # Authoritative design contract
│   ├── UX4G_BRD_Template.md      # The Business Requirements Document — §9.4 is
│   │                              # the footer/GIGW mandate, §11 is brand/tone,
│   │                              # §15 is the numbered list of open BRD questions
│   │                              # (Q-01 through Q-08) referenced throughout the
│   │                              # code as "BRD §15 Q-0N is unresolved"
│   └── _archive/                 # Historical/flagged-unreliable — never authoritative
├── Pages_Userflow/
│   ├── 00-README.md              # Cross-cutting contract: status model (§A),
│   │                              # violation taxonomy (§B), Role Permission
│   │                              # Matrix (§C), fixed vocabulary (§D), build order
│   ├── 01-login.md … 11-citizen-grievance-portal.md   # One spec file per page
│   └── 13-history-and-hierarchy.md   # Addendum: extraction transparency (§1),
│                                       # report export (§2), history/audit (§3),
│                                       # Hierarchical Management/jurisdiction (§4).
│                                       # No file numbered 12.
├── .claude/
│   └── skills/ux4g-design/       # IMPLEMENTATION_GUIDE.md, DESIGN_SYSTEM.md,
│                                   # ACCESSIBILITY_AND_QA.md, VISUAL_QA_LOOP.md —
│                                   # loads automatically; read before any UI work
├── src/
│   ├── app/[locale]/
│   │   ├── (public)/             # No auth. Login, landing, Grievance Portal, and
│   │   │   │                      # the five statutory pages (accessibility,
│   │   │   │                      # privacy, terms, rti, help). Shares one layout:
│   │   │   │                      # PublicMasthead + Footer, no sidebar.
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # Landing page
│   │   │   ├── login/, grievance/
│   │   │   └── accessibility/, privacy/, terms/, rti/, help/
│   │   ├── (auth)/                # Behind RequireAuth (client-side only, not a
│   │   │   │                      # security boundary — see its own doc comment).
│   │   │   │                      # AppShell: Sidebar + Header + Footer.
│   │   │   ├── dashboard/         # STATIC FIXTURES ONLY — §6 below is the next task
│   │   │   ├── scan/, scan/[id]/status/
│   │   │   ├── extraction/[id]/
│   │   │   ├── records/, records/[id]/
│   │   │   ├── analytics/
│   │   │   ├── ecommerce/, ecommerce/batch/[batchId]/
│   │   │   ├── manufacturers/, manufacturers/[id]/
│   │   │   ├── reports/, profile/
│   │   │   └── activity/          # Global Activity Log (13 §3.2)
│   │   ├── (capture)/scan/mobile/, scan/mobile/[token]/   # No shell — phone-only
│   │   └── api/                   # 34 real Route Handlers — see BACKEND_HANDOFF §3
│   │       ├── records/, records/[id]/{verify,corrections,needs-review,
│   │       │   flag-enforcement,archive,retry-ocr}/, records/bulk/needs-review/
│   │       ├── scan-pipelines/, scan-pipelines/[scanId]/retry/[stageId]/
│   │       ├── mobile-sessions/ (+ [token]/{connect,capture})
│   │       ├── grievances/, grievances/[reference]/     # THE public endpoint
│   │       ├── analytics/
│   │       ├── manufacturers/, manufacturers/[id]/{scorecard,flag-enforcement}/
│   │       ├── reports/, reports/generate/, reports/scope/, reports/[id]/,
│   │       │   reports/[id]/download/[format]/, reports/runs/[runId]/(+retry)
│   │       ├── ecommerce/{scrape,scan,batches}/, ecommerce/batches/[batchId]/
│   │       └── activity/
│   ├── types/                     # The domain model — import from "@/types" (barrel)
│   │   ├── vocabulary.ts          # Every fixed enum: statuses, roles, source tags,
│   │   │                          # the 10-category violation taxonomy, confidence bands
│   │   ├── user.ts                # User, Session, Permission, ROLE_PERMISSIONS
│   │   ├── jurisdiction.ts        # NEW (this session) — Jurisdiction, JurisdictionLevel
│   │   ├── scan.ts                # UploadedImage, pipeline stages, ScanMetadata,
│   │   │                          # ExtractedDeclaration, e-commerce scraping types
│   │   ├── compliance.ts          # ComplianceRecord (the spine of the product),
│   │   │                          # DeclarationCheck, Violation, ComplianceScore
│   │   ├── history.ts             # ActivityEvent (17 types), the rich audit log's
│   │   │                          # own vocabulary — distinct from compliance.ts's
│   │   │                          # coarser AuditEvent (7 types)
│   │   ├── grievance.ts           # Citizen portal types, PII-separation design
│   │   ├── manufacturer.ts, report.ts, analytics.ts
│   │   └── index.ts               # export * from every module above
│   ├── lib/
│   │   ├── server/                # In-memory stores behind the API routes.
│   │   │   │                      # ALL reset on server restart. See §7.
│   │   │   ├── scan-pipeline-store.ts   # 1600+ lines, THE primary store.
│   │   │   │                            # getAllActiveRecords() is the shared merge
│   │   │   │                            # point; scopeRecordsForViewer() is applied
│   │   │   │                            # after each relevant record-set construction.
│   │   │   │                            # scopeRecordsForViewer() and reassignCase()
│   │   │   │                            # (this session's jurisdiction work) live here.
│   │   │   ├── audit-store.ts     # The central activity log. ONE write path:
│   │   │   │                      # emitActivityEvent(). listActivity() backs the
│   │   │   │                      # Global Activity Log's query surface.
│   │   │   ├── mobile-session-store.ts   # QR handoff sessions — sound design,
│   │   │   │                              # see BACKEND_HANDOFF.md §8.3
│   │   │   ├── grievance-store.ts # Citizen submissions + the demo-grade rate limit
│   │   │   ├── ecommerce-store.ts, report-store.ts, report-render.ts (REAL PDF/DOCX)
│   │   ├── api/                   # Client-side fetch wrappers. Some gated by
│   │   │   │                      # isMockMode(), some (server-authoritative
│   │   │   │                      # surfaces) never gated — see file-level comments
│   │   │   ├── records.ts, analytics.ts, manufacturers.ts, activity.ts,
│   │   │   │   reports.ts, scans.ts, auth.ts, grievances.ts, ecommerce.ts
│   │   ├── hooks/                 # useRecordsList, useAnalyticsData, useManufacturers,
│   │   │   │                      # useScanPipeline, useMobileHandoffSession,
│   │   │   │                      # useAuth/usePermission/useHasRole, useActivityLog
│   │   ├── mock/                  # Fixture data — "matches the shape the real API
│   │   │   │                      # is expected to return" per its own header comment
│   │   │   ├── users.ts           # 5 mock accounts (3 original + 2 jurisdiction test)
│   │   │   ├── jurisdictions.ts   # NEW (this session) — 19 rows, regionNamesVisibleTo()
│   │   │   ├── records.ts         # 12 seed ComplianceRecords, hand-built from a
│   │   │   │                      # compact RecordSeed[] so derived fields can't drift
│   │   │   ├── reference.ts       # INSPECTION_REGIONS (18 states), MOCK_MANUFACTURERS
│   │   │   ├── analytics.ts, manufacturers.ts, ecommerce.ts, reports.ts, grievances.ts
│   │   ├── constants/             # routes.ts (ROUTES + SIDEBAR_NAV), api-endpoints.ts
│   │   └── utils/                 # format.ts, photoQuality.ts (real canvas analysis),
│   │                               # shortCode.ts (mobile tokens + grievance refs)
│   ├── components/                # One directory per page/feature area, plus:
│   │   ├── shared/                # PageHeader, DataTable, EmptyState, ErrorState,
│   │   │                          # Pagination, FilterChip, Skeleton, RequireAuth
│   │   ├── layout/                # AppShell, Sidebar, Header, Footer, PublicMasthead
│   │   └── ui/                    # Low-level: Select, TextField, Alert, MetricCard…
│   ├── messages/en.json, hi.json  # ALL user-facing strings. Structural parity
│   │                               # enforced by npm run i18n:check. Hindi stays
│   │                               # mostly untranslated placeholders (1009 keys) —
│   │                               # that's expected, the check is structural only.
│   └── styles/                    # tokens.css (reference only, not imported),
│                                    # layout.css, typography.css, home.css
├── tests/
│   ├── unit/          # vitest — audit-store, jurisdiction, mock-data, format, vocabulary
│   └── e2e/           # playwright — login, dashboard, shell (nav/role gating)
└── scripts/           # verify-tokens.mjs, sync-locales.mjs, visual-qa.mjs, generate-placeholders.mjs
```

## 3. How this build actually works — the discipline to keep

This matters as much as the code. Every substantial change in this
project's history followed the same cycle, and departing from it is a
regression in process even if the code is fine:

1. **Plan Mode first.** For anything non-trivial, the user says "Plan
   mode — do not write or edit any files yet, just produce a plan," names
   the spec section to read, and lists what the plan must cover. The
   assistant reads the actual code (never works from memory of having
   built it), surfaces findings that change the shape of the plan — including
   ones that contradict the prompt's own hints — states explicit
   recommendations, and uses `AskUserQuestion` only for the genuinely
   high-blast-radius forks where reasonable people could differ. The plan
   is presented as text and the assistant **waits** — it does not start
   implementing until the user says so (typically the single word
   "implement").
2. **Read before writing, always.** Every session in this build started
   with direct reads of the relevant types, stores, routes, and existing
   tests — never assumptions carried from a summary. Several planning
   passes overturned an assumption the prompt itself suggested (e.g.
   "region ≡ District" turned out to be wrong; the data proved region ≡
   State). Trust the code over the prompt's framing.
3. **Verify before declaring done.** After implementing: `npm run verify`
   (tokens + i18n sync + typecheck + lint), `npx vitest run`, `npx
   playwright test`, and a **live browser walk** — signing in as each
   relevant mock account and checking the actual rendered page and network
   responses, not just green tests. Several real bugs in this build were
   only caught this way (a permission gate that existed in the nav but not
   the page; a label map that worked for seed data but not live data).
4. **Commit only when asked**, with a message that explains *why*, not
   just what changed, in the voice already established in `git log`. When
   two unrelated pieces of work are sitting uncommitted, split them into
   separate commits rather than one mixed one.
5. **State assumptions and open questions explicitly**, in the plan or in
   code comments, rather than silently picking one. This codebase has a
   consistent voice of honest self-documentation — comments admit what's
   mocked, what's a placeholder, what's a known limitation — and new work
   should match that voice, not paper over gaps.

## 4. What's built — current status

All 11 numbered pages plus the two unnumbered ones from spec addendum 13,
**plus the five statutory footer pages**, are built: Login, Dashboard,
Scan/Upload (+ Mobile Capture + Processing Pipeline Tracker), Extraction &
Verification, Compliance Records, Product Compliance Detail, Analytics,
E-commerce Listing Scanner, Manufacturer Scorecard, Reports & Profile,
Citizen Grievance Portal, the Global Activity Log, and Accessibility
Statement / Privacy Policy / Terms of Use / Right to Information / Help.
**Not built:** only the Admin Console (13 §4.3) and Jurisdiction Session 2
(Dashboard's live-wiring + scoping + roll-up table, see §6) remain.

Full per-page status, access-control detail (nav-hiding vs. genuine
page-level enforcement, checked per page), and the complete data model and
API surface are in **`BACKEND_HANDOFF.md`** — do not re-derive this by
re-reading every file; that document was built exactly that way and is
current as of `ee639f4`. Three things changed since it was written (§5
below): the document itself was added, jurisdiction scoping landed, and
the five statutory pages were built (BACKEND_HANDOFF.md's own §1 still
lists them as not built — that line is now stale, everything else in it
still holds).

## 5. Recent work, chronological order

### a) `BACKEND_HANDOFF.md` (commit `9860d1c`)

A from-scratch, zero-context backend handoff document — every type field,
every API route's exact request/response shape and REAL-vs-MOCKED status,
a prioritized mock-vs-real gap list (the officer-facing quality gate is
P0 — it's mocked to always pass while the citizen path does genuine
canvas-based image analysis), image/file handling end to end, polling
intervals, known technical debt, what's already production-real (PDF/DOCX
generation, the central audit store, the mobile handoff session model),
hardcoded config values, existing test coverage, and a recommended
backend architecture (Postgres, a separate Python OCR/rule-engine
service, server-side sessions, phased build order). **This is the
document to hand to anyone starting real backend work.** It was written
by reading every relevant file directly, not from memory — treat it as
authoritative for "what exists today" but re-verify anything before
building on top of it, since code moves faster than docs.

### b) Jurisdiction-scoped visibility, Session 1 of 2 (commit `ed5ceba`)

Spec: `Pages_Userflow/13-history-and-hierarchy.md` §4 (Hierarchical
Management). This added `Jurisdiction` as an organizational dimension
orthogonal to role, and scoped **Compliance Records, Analytics, and the
Manufacturer Scorecard** by it. **Dashboard was deliberately left
untouched** — see §6 below, this is the very next task.

**The reconciliation that shaped everything:** every existing `region`
value (`INSPECTION_REGIONS`, every seed record, every mock user's
posting) is already an Indian *state* name. So a `State`-level
`Jurisdiction` is a rename/extension of `region`, not a second taxonomy —
this was verified by reading the actual data, not assumed. **No
`District` jurisdiction was seeded** — nothing in this codebase has ever
recorded anything finer than a state, and inventing district values would
be fabricating data rather than modeling it.

**What was added, precisely:**

- `src/types/jurisdiction.ts` — new file. `JURISDICTION_LEVELS =
  ["National", "State", "District"]`, `Jurisdiction { id, level, name,
  parentJurisdictionId? }`.
- `src/lib/mock/jurisdictions.ts` — 19 rows (1 National root + 18 State,
  one per `INSPECTION_REGIONS` value). Exports `regionNamesVisibleTo(jurisdictionId):
  string[] | null` — `null` means "don't filter at all" (National, or an
  unresolvable id — deliberately fail-open, not fail-closed, matching the
  app's existing no-server-auth posture).
- `User` gained `jurisdictionId: string` and `reportsToUserId?: string`
  (`src/types/user.ts`). The three original mock accounts (`usr-001`
  Rohan Deshmukh/EO, `usr-002` Sunita Iyer/Admin, `usr-003` Arindam
  Banerjee/Reviewer) are pinned to **National** — required, not
  incidental, so their visibility is provably unchanged from before this
  feature existed. Two new accounts were added specifically to exercise
  real narrowing: `usr-004` Priya Kulkarni (Admin, State/Maharashtra) and
  `usr-005` Vikram Jadhav (Enforcement Officer, State/Maharashtra,
  starting with **zero** seed cases — an honest empty state, not a broken
  one). Both use the same `Demo@2026` password.
- `ComplianceRecord` gained `assignedOfficerUserId?: string`
  (`src/types/compliance.ts`) — **this is not in §4.1's own code block**,
  it's an inferred necessity: without a field reassignment can actually
  change, "an Officer sees their own cases" and case reassignment would
  have nothing to read or write. Populated at creation from the scanning
  officer (absent for Citizen-Reported, which has no officer).
- `scopeRecordsForViewer()` in `scan-pipeline-store.ts` — the **one**
  shared scoping rule, invoked after each relevant record-set construction:
  `listRecords`, `computeAnalyticsSummary`, the manufacturer scorecard chain
  (`recordsForManufacturer` → `buildScorecard` → both exported scorecard
  functions), direct record detail, and report scope resolution. `getAllActiveRecords()`
  is the shared live+static merge point, not the scoping choke point. Two rules, in order: jurisdiction narrows by region; then, **regardless
  of jurisdiction level**, an Enforcement Officer sees only
  `assignedOfficerUserId === viewer.id` (per §4.2's literal wording — this
  is why Rohan Deshmukh's own Records view narrowed from 11 to 7 even
  though he's National). Reviewer stays unscoped — §4.2 states no rule
  for it.
- `reassignCase(recordId, newOfficerUserId, reassignedByUserId)` — closes
  the previously-declared-but-never-emitted `case_reassigned` gap.
  Validates the reassigning user is an Admin whose jurisdiction covers the
  record's region, and the target is a real Enforcement Officer. **No
  route handler and no UI call it yet** — it's backend logic only,
  unit-tested, deliberately deferred to whenever the Admin Console (13
  §4.3) is built, since that's where the actual "pick a case, pick an
  officer" screen belongs.
- A `viewerId` query parameter now threads through `GET /api/records`,
  `GET /api/analytics`, `GET /api/manufacturers`, and `GET
  /api/manufacturers/[id]/scorecard`, and their client hooks
  (`useRecordsList`, `useAnalyticsData`, `useManufacturers`,
  `useManufacturerScorecard` — each now calls `useAuth()` internally and
  passes `user?.id`). This mirrors the existing (already-insecure)
  convention every mutation already uses — there's no server-side session
  to read identity from instead.
- `resetPipelineStoreForTests()` added to `scan-pipeline-store.ts`,
  mirroring the existing `resetAuditStoreForTests()` — needed to test
  `reassignCase` and live-record scoping without id collisions between
  tests.
- New tests: `tests/unit/jurisdiction.test.ts` (19 tests — scoping for
  every account, the fail-open-on-unresolvable-viewer case, and
  `reassignCase`'s four success/failure paths), plus four new tests
  appended to `tests/unit/mock-data.test.ts` asserting the backward-
  compatibility requirement in code (existing three accounts → National,
  new two → Maharashtra State, no District seeded).

**Verified live** (not just unit tests): signed in as each of the five
accounts and confirmed via both the rendered UI and direct
`fetch()` calls against the running dev server that Records/Analytics/
Scorecard counts matched exactly what the plan predicted — Rohan
Deshmukh 11→7, Priya Kulkarni sees exactly 2 (Maharashtra), Vikram Jadhav
starts at 0 then shows exactly 1 after a live scan, and his Admin then
sees 3. A stray `Failed to load resource: 500` console message appeared
on Dashboard during verification, reproduced even after a full dev-server
restart, but every actual request in the server's own access log returned
200 and the page rendered its full content correctly — most likely an
HMR/cold-start artifact, unrelated to this diff since Dashboard has zero
live data wiring for this work to have touched. **Worth a glance early in
Session 2**, since that's exactly where Dashboard's data layer gets
rebuilt.

### c) The five statutory footer pages (commit `885808c`)

Spec: BRD §9.4 / GIGW 3.0. `Footer.tsx` has linked to
`/accessibility`, `/privacy`, `/terms`, `/rti`, `/help` since the shell
was built — all five 404'd until this commit. Small, self-contained, no
plan-mode cycle was used for this one (the user asked for it directly
rather than via "Plan mode —").

Each page reuses the existing `(public)` route group's layout (no new
layout component) — a thin async Server Component per page
(`generateMetadata` + a `<main>` of `<section>` blocks), following the
Citizen Grievance Portal's exact markup shape. No spec file covers their
actual content, so each follows standard GIGW/RTI Act conventions rather
than generic filler:

- **Accessibility Statement** states the real WCAG 2.1 AA target (BRD
  §3) and names one genuine, already-documented gap rather than
  boilerplate: generated PDF reports are not tagged-accessible
  (`ReportAccessibility.pdfIsTagged` is always `false` — see
  `BACKEND_HANDOFF.md` §2.7), with DOCX offered as the accessible
  alternative.
- **Privacy Policy** accurately describes the real PII-separation design
  already built into `grievance-store.ts` (a citizen's name/contact are
  kept separate from the compliance record their report creates, and only
  a boolean travels onto it) rather than a generic "we protect your data"
  paragraph.
- **Right to Information** references the real `rtionline.gov.in`
  Government of India RTI portal (plain text, not a link) and names the
  CPIO/Appellate Authority by **designation only**, matching this
  codebase's existing discipline of never inventing a real person's name
  (the same reasoning `CITIZEN_ACTOR_ID` documents in `grievance.ts`).
- **Terms of Use** covers the standard six clauses every Government of
  India site carries: acceptance, permitted use, hyperlinking policy,
  content ownership, disclaimer, governing law.
- **Help** is organised by audience (Officer/Admin, Reviewer, member of
  the public) since those are the only three the system actually has, and
  links out to Login and the Grievance Portal as real actions.

All content lives in a new `staticPages` namespace in both
`src/messages/en.json` and `hi.json` (English content only — Hindi stays
placeholder, per the existing convention). Verified live in both themes
and at 375px (no horizontal overflow), and that every footer link now
resolves instead of 404ing, from both the public and authenticated
shells.

## 6. The next task — Jurisdiction Session 2

This was planned but not started. The plan (confirmed by the user, not
yet executed):

**Give Dashboard a live data path for the first time, then scope it.**
Verified fact, not a guess: `src/app/[locale]/(auth)/dashboard/page.tsx`
is an `async` **Server Component** that imports `MOCK_ACTIVE_RECORDS`,
`MOCK_DASHBOARD_ALERTS`, `MOCK_KPIS` directly, and `TrendPanel` reads
`getTrendForPeriod()` from static fixtures too — **none of it calls
`getAllActiveRecords()` or any Route Handler.** This is the fourth
instance of the "live-data blindness" bug class this build has hit
(after Records, Analytics, Scorecard), just never forced into the open
before, because jurisdiction scoping requires knowing *who's looking*,
and a Server Component can't read `sessionStorage` (the same reason
`RequireAuth` is client-side only — see its own doc comment).

Concretely, Session 2 needs to:

1. **Convert Dashboard's data-fetching model** from server-rendered
   static props to a client-composed page, mirroring the established
   pattern already used by Records/Analytics/Manufacturers: a thin async
   server shell (`generateMetadata` + `PageHeader`) handing off to a
   `"use client"` view component that calls `useAuth()` and fetches from
   real endpoints. `src/app/[locale]/(auth)/records/page.tsx` +
   `RecordsView` is the exact precedent to mirror.
2. **Scope it** using the same `scopeRecordsForViewer()` already built —
   no new scoping logic needed, just a new call site.
3. **Build the National-only roll-up breakdown table.** §4.2 asks for a
   sortable-by-non-compliance-rate table for State/National Admins.
   Already confirmed: `RegionalDistributionTable`
   (`src/components/analytics/RegionalDistributionTable.tsx`, used on
   page 7) already renders almost exactly this — one row per region,
   total scanned, non-compliant count, computed rate, deep link into
   filtered Records. Two real gaps against it: it isn't actually
   sortable (`DataTable` has no interactive column-sort at all — the fix
   is to pre-sort the rows by rate descending server-side, not add
   sorting to a shared component five other pages depend on), and once
   scoping lands, a State Admin's own breakdown collapses to one row
   (nothing to roll up under a state with no districts) — so **the
   roll-up section is only meaningful for National viewers** and should
   render nothing at all for a State Admin, as a deliberate omission, not
   a missing feature.
4. **Regression-verify all five accounts** on Dashboard specifically,
   since this is a real architectural change to an already-shipped page,
   not just a filter addition.

**Do not re-litigate the decisions already made in Session 1** (region ≡
State reconciliation, no District data, the EO own-cases rule shipping
now, `assignedOfficerUserId` existing) — those were deliberated and
confirmed; treat them as settled unless new evidence contradicts them.

## 7. Established code conventions worth knowing before touching anything

- **`src/lib/server/*.ts`** are in-memory stores behind real Next.js
  Route Handlers — `scan-pipeline-store.ts` (the primary one,
  `getAllActiveRecords()` is the shared merge point and `scopeRecordsForViewer()`
  is the shared scoping rule), `audit-store.ts` (the central activity log,
  one write path via `emitActivityEvent`), `mobile-session-store.ts`,
  `grievance-store.ts`, `ecommerce-store.ts`, `report-store.ts`. All
  reset on server restart. Each has a `resetXForTests()` seam.
- **Client data-fetching hooks** (`src/lib/hooks/use*.ts`) call
  `useAuth()` directly when they need viewer identity — never threaded in
  as a prop from the view component. `usePermission()`/`useHasRole()` do
  the same for role gating.
- **Barrels** (`@/types`, `@/lib/mock`, `@/lib/hooks`) use `export *` /
  named re-exports. Server modules that need a mock module import it
  **directly from its file**, not through the barrel, to avoid real
  import cycles — this is called out in comments wherever it matters.
- **`exactOptionalPropertyTypes: true`** means an optional field must be
  *absent*, never explicitly `undefined`. The established idiom for
  conditionally adding a field to an object literal is `if (x !==
  undefined) { obj.field = x; }` after construction, not `{ field: x ??
  undefined }`.
- **Page-level permission enforcement is separate from nav-hiding.** The
  Global Activity Log shipped once with nav-hiding only and no page-level
  check — caught during its own live verification, fixed with an
  in-place `EmptyState` refusal (not a redirect), matching how the scan
  wizard refuses a Reviewer. **Check both** whenever gating a new page.
- **The `?demo=` URL convention** exists across many pages for exercising
  loading/empty/error states deterministically without real failures.
- **Every fixed vocabulary value** (statuses, roles, source tags,
  violation categories) is a `const` array + derived type in
  `src/types/vocabulary.ts`, never a retyped string literal, and needs an
  entry in both `src/messages/en.json` and `hi.json` —
  `tests/unit/vocabulary.test.ts` asserts this.
- **`react-hooks/set-state-in-effect`** has been hit and fixed three
  separate times in this build. The fix is always to *derive* state (a
  loading flag from a stale-key comparison, a demo state from the URL)
  rather than write it synchronously inside a non-mount effect.

## 8. Known technical debt (see `BACKEND_HANDOFF.md` §7 for the full list)

- One flaky Playwright test, `tests/e2e/dashboard.spec.ts:47` ("the
  weekly/monthly toggle switches pressed state") on `mobile-390`. Under a
  full 81-test parallel run, other `dashboard.spec.ts` tests on
  mobile/tablet viewports intermittently join it — confirmed via repeated
  isolated re-runs that this is resource contention under full-suite
  load, not a real regression; the same file run alone always passes
  clean. Never chase this without isolating it first.
- The Admin Console (13 §4.3) doesn't exist — no route, no UI. Its three
  tabs (Team & Jurisdiction, Rule Thresholds, System) are where
  `reassignCase()` gets a UI, where `REPEAT_VIOLATION_THRESHOLD` stops
  being a frozen constant, and where the OCR confidence threshold and
  compliance score bands become editable.
- The officer-facing Image Quality Inspection Layer
  (`checkImageQuality()` in `src/lib/api/scans.ts`) is mocked to always
  pass — it never inspects the file. The citizen portal's photo check
  (`src/lib/utils/photoQuality.ts`) does genuine canvas-based blur/
  darkness analysis. This inconsistency is flagged as the single highest-
  priority mock-vs-real gap in `BACKEND_HANDOFF.md`.
- No server-side authentication or authorization anywhere — every
  mutation trusts a client-supplied `userId`; every read that now accepts
  `viewerId` trusts it the same way. This is a pre-existing, documented,
  app-wide gap, not something any single session is expected to close
  alone.

## 9. Commands to resume work

```bash
npm run verify        # tokens + i18n sync + typecheck + lint
npx vitest run         # unit tests (86 passing as of 885808c)
npx playwright test     # e2e (80/81 passing; 1 known-flaky, see §8)
```

Dev server: use the `preview_start` tool with the `digi-pramaan-dev`
config in `.claude/launch.json` (`npm run dev`, port 3000), not a raw
Bash `npm run dev` — this project's workflow drives the browser through
the Claude Browser pane tools for live verification.

Mock login accounts, all password `Demo@2026`:

| Username | Name | Role | Jurisdiction |
|---|---|---|---|
| `r.deshmukh` | Rohan Deshmukh | Enforcement Officer | National |
| `s.iyer` | Sunita Iyer | Admin | National |
| `a.banerjee` | Arindam Banerjee | Reviewer | National |
| `p.kulkarni` | Priya Kulkarni | Admin | State — Maharashtra |
| `v.jadhav` | Vikram Jadhav | Enforcement Officer | State — Maharashtra |
