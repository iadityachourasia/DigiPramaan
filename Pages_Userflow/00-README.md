# SIH26034 — Frontend Build Pack (Corrected v2)

This pack contains one detailed markdown file per page. This version fixes
six issues found in review: an unreconciled status model, inconsistent
action naming, inconsistent role naming, an undefined Reviewer role, a
violation-taxonomy mismatch between pages, and an unstated relationship
between two similar pages. Read this file fully before building anything —
it's the single source of truth every page file now points back to.

## What changed in this revision

1. **Unified the two status systems** that used to run in parallel unexplained
   (see "Status Model" below).
2. **Standardized the finalize action** to one name: "Confirm & Verify."
3. **Standardized role naming** to full names everywhere (no more "Officer"
   shorthand that wouldn't match "Enforcement Officer" in actual code).
4. **Defined the Reviewer role** with real permissions (see "Role Permission
   Matrix" below) instead of leaving it dangling from Login with no purpose.
5. **Created one canonical 10-category violation taxonomy** used identically
   on the Extraction & Verification, Product Compliance Detail, Analytics,
   and Manufacturer Scorecard pages.
6. **Clarified the Scan/Upload vs. E-commerce Listing Scanner relationship**
   so the two pages don't read as redundant.

---

## A. Status Model (read this first — it's the fix that mattered most)

Two separate dimensions exist. Keep them separate in your data model.

**Verification Status** — internal workflow state, relevant only on the
Declaration Extraction & Verification and Product Compliance Detail pages:
- `Extracted` — OCR/extraction has run, nothing confirmed by a human yet
- `Verified` — an Enforcement Officer or Admin has confirmed/corrected the
  extracted data via the "Confirm & Verify" action

**Compliance Status** — the fixed 4-value status shown everywhere else
(Dashboard, Compliance Records, Manufacturer Scorecard, Analytics):
- `Pending` — Verification Status is still `Extracted`. This is the default
  status for every newly created record. It means "compliance has not yet
  been determined," not "processing is slow."
- `Compliant` — Verification Status is `Verified` AND the declaration
  checklist has zero failed items.
- `Non-Compliant` — Verification Status is `Verified` AND the declaration
  checklist has one or more failed items.
- `Needs Review` — a manual escalation flag, applied explicitly via a
  "Flag as Needs Review" action (by an Enforcement Officer, Admin, or
  Reviewer) after verification, for ambiguous or borderline cases needing a
  supervisor's judgment. This is never computed automatically — it always
  overrides the auto-computed Compliant/Non-Compliant value until resolved.

**In short:** Compliant/Non-Compliant are computed. Pending means
unverified. Needs Review is a human override. Never let a page imply that
"Pending" means something is broken or slow — it specifically means
"awaiting verification."

## B. Canonical Violation Taxonomy — use this exact wording everywhere

| # | Category (use verbatim) | Legal basis |
|---|---|---|
| 1 | Manufacturer/Packer/Importer Details Missing | Rule 6(a) |
| 2 | Generic Name Missing or Incorrect | Rule 6(b) |
| 3 | Net Quantity Missing or Incorrect | Rule 6(c) |
| 4 | Manufacture/Import Date Missing | Rule 6(d) |
| 5 | MRP Non-Compliance | Rule 6(e) |
| 6 | Country of Origin Missing | Rule 6 (imports only) |
| 7 | Consumer Care Details Missing | Rule 6 |
| 8 | Font Size / Readability Failure | Rule 7 |
| 9 | Non-Standard or Misleading Format | Rule 8/9 |
| 10 | Other | — |

This is the single list used by: the per-field checklist on Extraction &
Verification, the Violation Summary on Product Compliance Detail, the
breakdown chart on Analytics, and the breakdown on the Manufacturer
Scorecard. If a page needs a shorter chart label, abbreviate consistently
(e.g. "MRP Non-Compliance" can shorten to "MRP" only in an axis label, never
in a legend, tooltip, or written summary).

## C. Role Permission Matrix

| Action | Enforcement Officer | Admin | Reviewer |
|---|---|---|---|
| Scan/upload a new product | ✅ | ✅ | ❌ |
| Confirm & Verify extracted data | ✅ | ✅ | ❌ |
| Flag as Needs Review | ✅ | ✅ | ✅ |
| Flag for Enforcement | ✅ | ✅ | ❌ |
| Archive a record | ❌ | ✅ | ❌ |
| Bulk status change | ❌ | ✅ | ❌ |
| View Analytics / Manufacturer Scorecard | ✅ | ✅ | ✅ |
| Manage rule thresholds (stretch feature) | ❌ | ✅ | ❌ |
| Generate reports | ✅ | ✅ | ✅ |

Reviewer is a QA/oversight role: full read access and reporting, plus the
ability to escalate a case to Needs Review, but no verification or
enforcement authority. Use the full role name "Enforcement Officer" in every
role-gating reference — never shorten to "Officer" in anything that becomes
a literal permission check.

## D. Fixed Vocabulary — quick reference

- Compliance status: `Pending` / `Compliant` / `Non-Compliant` / `Needs Review`
- Verification status (pages 4 & 6 only): `Extracted` / `Verified`
- Source tags: `Officer-Scanned` / `Citizen-Reported` / `E-commerce-Sourced`
- Roles: `Enforcement Officer` / `Admin` / `Reviewer`
- Finalize action: `Confirm & Verify` (performed only on the Extraction &
  Verification page — the Product Compliance Detail page instead shows
  "Complete Verification," which navigates there rather than performing the
  action itself; that's an intentional difference in what the button does,
  not inconsistent naming)
- Escalation action: `Flag as Needs Review`
- Confidence display: a percentage (0–100%), plus a derived band shown
  alongside for quick scanning — High (≥90%), Medium (70–89%), Low (<70%)

## E. Page relationship note: Scan/Upload vs. E-commerce Listing Scanner

Page 3's optional "e-commerce listing URL" field is for noting that a
**physically photographed** product is *also* listed online — the primary
input is still the photo. Page 8 (E-commerce Listing Scanner) is for the
opposite case: there is **no physical photo at all**, and the scan
originates entirely from scraping an online listing's images. They share
the same downstream extraction pipeline but serve different intake
scenarios.

---

## Build order

| Order | Page | File |
|---|---|---|
| 1 | Login (standalone, no shell — user isn't authenticated yet) | `01-login.md` |
| 2 | Dashboard (+ build the shared Sidebar/Header shell here — this is the first authenticated page) | `02-dashboard.md` |
| 3 | Scan / Upload Product | `03-scan-upload.md` |
| 4 | Declaration Extraction & Verification | `04-extraction-verification.md` |
| 5 | Compliance Records | `05-compliance-records.md` |
| 6 | Product Compliance Detail | `06-product-compliance-detail.md` |
| 7 | Analytics & Violation Trends | `07-analytics-violation-trends.md` |
| 8 | E-commerce Listing Scanner (USP) | `08-ecommerce-listing-scanner.md` |
| 9 | Manufacturer Compliance Scorecard (USP) | `09-manufacturer-scorecard.md` |
| 10 | Reports & Profile | `10-reports-profile.md` |
| 11 | Citizen Grievance Portal (USP, public, no shell) | `11-citizen-grievance-portal.md` |

Page 4 is the page that most directly demonstrates your PS's core ask.
Protect its build and review time above all others.

---

## How to use these files with Claude Design

Claude Design doesn't have a persistent memory file the way Claude Code
does — its continuity comes from staying inside **one project/canvas
thread** for the whole app, and from the UX4G component library you import
at the start, which Claude Design checks generated output against
automatically. That changes the workflow slightly from a code-editor
approach:

### Step 1 — Create one Claude Design project for the entire app
Do not start a new project per page. Every page prompt below assumes the
model can see everything built earlier in the same thread — that's what
gives you a consistent shell, consistent tokens, and consistent component
reuse across 11 pages.

### Step 2 — Import your UX4G component library / Design.md first
Before sending any page prompt, import or attach your UX4G component
library and Design.md to the project. Confirm Claude Design has acknowledged
it before proceeding — if it hasn't, generated screens will drift toward
generic defaults instead of your actual tokens.

### Step 3 — Send the Project Brief as your first message
Paste this before any page-specific prompt:

```
This is a Government of India digital product on the mandatory UX4G Design
System v3. I've imported our UX4G component library and Design.md — use
them as the authoritative source. Wherever anything you generate would
conflict with the imported library or Design.md, the imported system wins
outright — never blend or improve on it. Never invent a token name or hex
value; if something is ambiguous, ask me rather than approximating.

Hard constraints for every screen in this project:
- Only semantic/role-tier tokens — never a raw primitive.
- No custom brand colors are defined yet — use the default UX4G theme.
- Noto Sans only, including regional scripts.
- Four non-interchangeable spacing axes: Padding (container interior),
  Stack (vertical rhythm), Inline (horizontal siblings), Section (between
  major regions). Choose by structural role, never by matching a number.
- Never signal status by color alone — pair every status token with an
  icon and/or visible text label.
- Form controls use Border/Neutral/Strong or Control/Border/Error, never
  the resting default border.
- WCAG 2.1 AA floor: 4.5:1 contrast, 44x44px minimum touch targets, visible
  focus state on every interactive element, real associated labels on every
  form field.
- No Tailwind or any other utility CSS framework.
- Reserve brand-primary fill for primary actions/active states/identity
  moments only — this must read as a government service, not a marketing
  site.

Fixed vocabulary — use exactly, never paraphrase:
- Compliance status: Pending / Compliant / Non-Compliant / Needs Review
- Verification status (only relevant on 2 specific pages, more on that when
  we get there): Extracted / Verified
- Source tags: Officer-Scanned / Citizen-Reported / E-commerce-Sourced
- Roles: Enforcement Officer / Admin / Reviewer

This project is an 11-page Legal Metrology compliance-checking system for
DoCA. I'll send you one page at a time, in order, starting with Login. Keep
everything you build consistent with what came before it in this same
project. Ask me clarifying questions about tokens or components before
generating, rather than guessing.
```

### Step 4 — Send each page's prompt, one at a time, in build order
Each page file's final section is titled **"Claude Design Prompt"** —
copy that section verbatim into the same project thread. Do not combine
multiple pages into one message; review each screen before moving to the
next.

### Step 5 — Review against that page's Definition of Done before continuing
Every page file has a checklist. Confirm it before sending the next page's
prompt — catching drift on page 3 is cheap, catching it after page 9 means
re-checking six pages.

### Step 6 — Run a consistency check every 3–4 pages

```
Review the screens you've built so far in this project for: token
consistency, whether the fixed status/role/source vocabulary is used
verbatim everywhere, whether the violation taxonomy matches across screens
that show it, and whether any component was rebuilt instead of reused from
our imported library. List issues before fixing anything.
```

### Step 7 — When design is finalized, hand off to Claude Code
Claude Design is your prototyping surface, not your production app. Once
all 11 screens are approved here, use Export → "Handoff to Claude Code" per
screen to move into your actual application with real data, auth, and
backend logic. That's a separate later phase — not needed until design here
is done.

---

## Definition-of-done cross-check (run once, after all 11 pages exist)

```
Confirm across every page built in this project: Compliance status values
are exactly Pending / Compliant / Non-Compliant / Needs Review everywhere,
never paraphrased. The violation taxonomy (10 categories from our brief)
reads identically on Extraction & Verification, Product Compliance Detail,
Analytics, and Manufacturer Scorecard. Role names are always written in
full (Enforcement Officer, not Officer). The finalize action is labeled
"Confirm & Verify" wherever it actually performs that action. Report any
deviation found, page by page.
```
