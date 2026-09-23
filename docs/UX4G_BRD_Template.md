# Business Requirements Document
## Digi-Pramaan — Legal Metrology Compliance System
### Department of Consumer Affairs (DoCA), Ministry of Consumer Affairs, Food & Public Distribution

---

> **Document version:** 0.1 (drafted from SIH26034.md + Pages_Userflow/ spec)
> **Status:** Draft — pending team review, especially §11 (brand/colour), §15 (open questions)

> **How this BRD was built:** Every field below is either (a) taken directly from the
> official problem statement `SIH26034.md`, (b) taken directly from `Pages_Userflow/`
> (the 11-page functional spec your team already wrote), or (c) a recommended default
> consistent with the mandatory UX4G contract in `docs/Design.md`. Fields that are
> genuinely undecided — not stated anywhere in the PS or the page spec — are marked
> **[TEAM TO CONFIRM]** rather than guessed. Section 15 collects every one of those
> in one place so you can resolve them in a single pass before Phase 1 of the build.

---

## DOCUMENT CONTROL

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 05 Sep 2026 | Claude (drafted from PS + Pages_Userflow) | Initial draft — all sections populated, open items flagged in §15 |
| 1.0 | | | Team review and sign-off — resolve §15 before this becomes final |

---

## TABLE OF CONTENTS

1. [Product Overview](#1-product-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Users & Personas](#4-users--personas)
5. [User Journeys](#5-user-journeys)
6. [Scope — Page & Screen Inventory](#6-scope--page--screen-inventory)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Content Requirements](#9-content-requirements)
10. [Integration Requirements](#10-integration-requirements)
11. [Design & Brand Requirements](#11-design--brand-requirements)
12. [Accessibility Requirements](#12-accessibility-requirements)
13. [Constraints](#13-constraints)
14. [Risks](#14-risks)
15. [Open Questions](#15-open-questions)
16. [Timeline & Milestones](#16-timeline--milestones)
17. [Appendix](#17-appendix)

---

## 1. PRODUCT OVERVIEW

### 1.1 Product Identity

| Field | Value |
|-------|-------|
| **Product name** | **Digi-Pramaan** (confirmed by the team, 2026-09-05). "Legal Metrology Compliance System" is retained as the descriptor line beneath it, per `01-login.md` §2's branding block, which asks for a project name plus a one-line description of what the system does. |
| **Parent organisation** | Department of Consumer Affairs (DoCA) |
| **Ministry / department** | Ministry of Consumer Affairs, Food & Public Distribution |
| **Product type** | Hybrid: an internal enforcement/admin tool (Pages 1–10) with one public-facing citizen module (Page 11, no login) |
| **Primary URL / domain** | **[TEAM TO CONFIRM]** — not assigned in the PS |
| **Launch type** | New product — no existing digital system is being replaced |
| **If revamp — replacing** | N/A |

### 1.2 Product Purpose

**One sentence — what this product does:**

> A software system that scans packaged-commodity labels, product images, and
> e-commerce listings; automatically extracts and validates the mandatory
> declarations required under the Legal Metrology (Packaged Commodities)
> Rules, 2011; and flags non-compliance so DoCA enforcement officers can act
> faster than manual inspection allows.

**What problem it solves:**

> Manual inspection and compliance checking across the large volume and
> variety of packaged products sold through retail stores, supermarkets, and
> e-commerce platforms is time-consuming and resource-intensive for
> enforcement agencies. Non-compliance — missing declarations, incorrect font
> sizes, improper MRP declarations — is frequently observed but caught only
> through manual spot checks, and the e-commerce channel is effectively
> unchecked today because it can't be physically inspected.

**What happens if this product does not exist (the stakes):**

> Consumers remain exposed to mislabelled or non-transparent packaging (no
> visible MRP, missing manufacturer details, unreadable font sizes).
> Enforcement stays reactive and inconsistent rather than systematic. The
> e-commerce sales channel — explicitly named in the PS as requiring
> compliance — stays effectively outside enforcement's reach at any scale.

### 1.3 Geographic & Regulatory Scope

| Field | Value |
|-------|-------|
| **Geographic scope** | National — **[TEAM TO CONFIRM]** whether this is a central DoCA pilot or intended for state-level enforcement rollout (see §15 Q-05); this affects the "Inspection region/state" field's actual value list |
| **Regulatory frameworks** | Legal Metrology Act, 2009; Legal Metrology (Packaged Commodities) Rules, 2011; WCAG 2.1 AA; GIGW 3.0 |
| **Government scheme / programme** | Smart India Hackathon 2026 — Problem Statement SIH26034 |
| **Must align with** | UX4G Design System v3 (mandatory, see `docs/Design.md`); GIGW 3.0; Digital India guidelines |

---

## 2. PROBLEM STATEMENT

### 2.1 Current Situation

> Every packaged commodity sold in India must carry mandatory declarations
> under the Legal Metrology (Packaged Commodities) Rules, 2011 — name and
> address of manufacturer/packer/importer, generic name, net quantity, MRP,
> month/year of manufacture or import, consumer care details, country of
> origin (for imports), all in a specified format, plus minimum font-size
> requirements for MRP and net-quantity numerals. Today, checking these
> declarations against physical products is done manually by enforcement
> officers, one label at a time, using visual inspection and no shared
> digital record. There is no equivalent process at all for e-commerce
> listings, which are sold through the same channel the Rules cover but
> can't be physically inspected.

### 2.2 Pain Points

| User | Pain Point | Severity (High/Med/Low) |
|------|-----------|------------------------|
| Enforcement Officer | Manually checking 7 declaration types + font-size rule per label is slow and inconsistent across officers | High |
| Enforcement Officer | No way to check e-commerce listings at all — the channel is invisible to inspection | High |
| Admin / enforcement leadership | No systematic view of violation trends, regional hotspots, or repeat-offending manufacturers | High |
| Consumer / Citizen | No direct channel to report a suspicious or non-compliant label encountered in-store | Medium |
| Reviewer / QA role | Ambiguous or borderline compliance calls have no formal escalation path today | Medium |

### 2.3 Root Causes

> No digital tooling exists for label scanning, extraction, or systematic
> validation against the Rules. Declaration data isn't centrally logged or
> searchable, so there's no way to see patterns across scans. E-commerce
> listings are structurally outside the reach of a physical-inspection
> process. There is no formal manufacturer-level repeat-violation tracking.

### 2.4 Opportunity

> Automated OCR-based extraction and validation against a fixed 10-category
> rule taxonomy turns inspection from manual spot-checking into a
> systematic, auditable process. Extending scanning to e-commerce listings
> closes a channel the PS explicitly names but that most manual processes —
> and most competing teams' MVPs — will miss. A manufacturer-level scorecard
> turns raw violation logs into an actual enforcement-prioritization tool. A
> citizen reporting channel multiplies enforcement's reach without added
> headcount, consistent with the PS's framing of this as a consumer
> protection system, not only an internal officer tool.

---

## 3. GOALS & SUCCESS METRICS

### 3.1 Goals

| # | Goal | Why it matters |
|---|------|---------------|
| 1 | Automate detection, extraction, and validation of all 7 mandatory declarations plus the font-size/readability rule | This is the PS's literal core ask — "automatically detecting, extracting and validating mandatory declarations" |
| 2 | Extend compliance checking to the e-commerce sales channel | The PS explicitly names e-commerce platforms as a channel requiring compliance; most competing teams will only build physical-label upload |
| 3 | Give enforcement leadership a manufacturer-level, repeat-violation view | Turns the system from "a log of scans" into a genuine enforcement-prioritization tool |
| 4 | Give citizens a direct, low-friction reporting channel | The PS frames this system in terms of consumer protection, not only internal enforcement |

### 3.2 Success Metrics

> **[TEAM TO CONFIRM]** — the numbers below are illustrative, sized for a
> hackathon demo, not real baselines. Neither the PS nor the page spec states
> actual manual-inspection time/volume data. If your team has any real
> figures (even rough ones from a mentor or DoCA contact), replace these
> before treating this table as final (see §15 Q-07).

| Metric | Baseline | Target | Measurement method |
|--------|----------|--------|--------------------|
| Time to fully review one label's declarations | ~5–10 min manual (estimated) | < 1 min system extraction + officer verification | Timestamp from upload to Confirm & Verify |
| Declaration categories checked per scan | Manual, officer-discretion, inconsistent | 10/10 canonical categories, every scan, no exceptions | System-enforced checklist completeness |
| E-commerce listings checked | 0 (no digital channel exists today) | [Team to set a demo/pilot volume target] | Count of records tagged `E-commerce-Sourced` |
| Citizen reports received | 0 (no channel exists today) | [Team to set a target] | Count of records tagged `Citizen-Reported` |

### 3.3 Anti-Goals

- Not a legal-determination or enforcement-action system — it flags violations with rule citations, but a human Enforcement Officer or Admin must always run "Confirm & Verify"; the system never auto-finalizes a violation without human sign-off (see the Status Model in `Pages_Userflow/00-README.md`).
- Not a payment, e-commerce takedown, or fine-collection system — out of scope entirely.
- Not a general product-safety or quality scanner — scope is strictly Legal Metrology *declaration* compliance (labelling), not food safety or other regulatory regimes.
- Not a full manufacturer identity-resolution system — spelling/name variations for the same manufacturer across scans are an explicitly documented known limitation, out of scope for MVP (`Pages_Userflow/09-manufacturer-scorecard.md`).

---

## 4. USERS & PERSONAS

> The PS and page spec name four distinct user types. The template below adds
> a fourth persona slot beyond the standard three, since the Citizen role is
> a named, first-class persona in `Pages_Userflow/11-citizen-grievance-portal.md`,
> not an edge case.

### Persona 1 — Field Enforcement Officer *(Primary User)*

| Field | Detail |
|-------|--------|
| **Name** | [Placeholder name — e.g. "Priya," fill in if useful for team discussion] |
| **Age range** | 25–50 (typical field-inspector range — **[estimated, not stated in spec]**) |
| **Location** | Retail markets, supermarkets, and shops across Tier 1/2/3 cities and rural areas — wherever inspections happen |
| **Primary device** | Smartphone in the field; laptop for records review back at the office |
| **Device model (if relevant)** | Entry-to-mid-range Android assumed (**[estimated]**) |
| **Network conditions** | Patchy/intermittent mobile connectivity in the field — directly stated in `03-scan-upload.md`: "field conditions are messy — poor lighting, one hand holding a phone, patchy connectivity" |
| **Language** | English at launch; Hindi scaffolded (§15 Q-03 resolved 2026-09-05). Further regional languages remain a v2 question. |
| **Digital literacy** | Moderate — comfortable with a work smartphone app, not necessarily tech-savvy |
| **Education** | [Not specified in spec] |
| **Occupation** | Enforcement Officer, Department of Consumer Affairs |
| **Primary goal on this product** | Scan a label, get a clear compliant/non-compliant answer with rule citations, move to the next inspection |
| **Secondary goals** | Flag e-commerce listings; check whether a manufacturer is a repeat offender |
| **Emotional state when using** | Under time pressure, task-focused — spec explicitly notes this page "needs to be fast and unambiguous under pressure" (`01-login.md`) |
| **What success looks like for them** | A full scan-to-verify cycle completes in under a couple of minutes and produces a record they'd trust citing in an enforcement notice |
| **Current workaround** | Manual, paper/checklist-based inspection (implied by the PS background) |
| **Key frustrations (current)** | Repetitive manual checking; no way to check e-commerce listings; no visibility into repeat offenders |
| **Accessibility needs** | None specifically stated in the spec — but note the officer is often working one-handed in the field, so large touch targets matter operationally even absent a formal accessibility need |

**Quote (representative of their mindset):**
> "I need to scan this label, get a straight answer on what's wrong, and move to the next shelf."

---

### Persona 2 — Admin (System Administrator / Enforcement Lead)

| Field | Detail |
|-------|--------|
| **Name** | [Fill in if useful] |
| **Role / title** | DoCA System Administrator |
| **Primary device** | Desktop/laptop, office-based |
| **Primary goal** | Oversee records at scale — archive, bulk status change, manage rule thresholds (e.g. the repeat-offender window), generate reports for leadership |
| **How often they use this product** | Daily |
| **Technical proficiency** | Comfortable with admin dashboards and bulk data tools |
| **Key frustrations (current)** | No manufacturer-level view for prioritizing enforcement action; no consolidated audit trail across officers |

Per the Role Permission Matrix in `Pages_Userflow/00-README.md`, Admin is the
**only** role that can archive records, run bulk status changes, and manage
rule thresholds (e.g. the 3-in-90-days repeat-offender window) — this
persona's permissions are already fully specified, not open.

---

### Persona 3 — Reviewer (QA / Oversight)

| Field | Detail |
|-------|--------|
| **Name** | [Fill in if useful] |
| **Role / title** | Quality / Oversight Reviewer |
| **Primary device** | Desktop, office-based |
| **Primary goal** | Audit ambiguous or borderline compliance calls; escalate a case to "Needs Review"; generate reports |
| **How often they use this product** | [Not specified in spec] |
| **Technical proficiency** | [Not specified in spec] |
| **Key frustrations (current)** | [Not stated anywhere in the spec — genuinely unknown, don't invent] |

Directly from `00-README.md`: "Reviewer is a QA/oversight role: full read
access and reporting, plus the ability to escalate a case to Needs Review,
but no verification or enforcement authority."

---

### Persona 4 — Citizen / Public Reporter *(secondary, public-facing)*

| Field | Detail |
|-------|--------|
| **Name** | [Fill in if useful] |
| **Age range** | Any adult member of the public |
| **Location** | Anywhere in India — typically in-store, scanning a QR code |
| **Primary device** | Smartphone only, their own personal device |
| **Network conditions** | Variable 4G mobile |
| **Digital literacy** | First-time/casual user — no account required, must work for anyone |
| **Primary goal on this product** | Report a suspicious or non-compliant label quickly, with no account and no friction |
| **Emotional state when using** | Mildly civic-minded, transactional — wants to submit and move on |
| **Current workaround** | None — no channel exists today |
| **Key frustrations (current)** | No current way to report; possible distrust that a report reaches anyone |
| **Accessibility needs** | None stated, but the spec is explicit that anonymous submission "should feel equally legitimate as a submission with contact info" (`11-citizen-grievance-portal.md`) |

**Quote (representative of their mindset):**
> "I noticed this pack doesn't show an MRP anywhere, but I don't have time to file a formal complaint somewhere."

---

### Persona Summary

| Persona | Device | Language | Literacy | Primary Goal | Priority |
|---------|--------|----------|----------|-------------|----------|
| Enforcement Officer | Smartphone (field) / laptop | En + Hi (min.) | Moderate | Scan → verify → citable record | P1 |
| Admin | Desktop | En + Hi (min.) | High | Oversight, bulk actions, thresholds | P2 |
| Reviewer | Desktop | En + Hi (min.) | Not specified | Escalate ambiguous cases | P2 |
| Citizen | Smartphone (own) | En + Hi (min.) | Low/casual | Report a suspicious label | P3 |

**Primary persona** (whose needs override all others when there is a conflict):

> **Enforcement Officer.** The PS's core ask — "automatically detecting,
> extracting and validating mandatory declarations" — is demonstrated
> through this persona's flow (Pages 1–6), and it's the persona a judge is
> most likely to see in a live demo.

**Most extreme accessibility need** (sets the accessibility design floor):

> **[TEAM TO CONFIRM]** — neither the PS nor the page spec names a persona
> with a specific accessibility need (e.g. low vision, screen reader use,
> motor impairment). WCAG 2.1 AA is mandated regardless (§12), but there's
> currently no persona-driven "floor" above that baseline. If your team knows
> of a specific accessibility requirement for field officers or citizens,
> add it here — don't leave this blank when you present to Claude Code, since
> `IMPLEMENTATION_GUIDE.md` explicitly asks for this before Phase 1.

---

## 5. USER JOURNEYS

### Journey 1 — Scan & Verify a Physical Label *(P1)*

| Field | Detail |
|-------|--------|
| **Persona** | Enforcement Officer |
| **Goal** | Determine whether a scanned product's label is compliant and produce a legally citable record |
| **Entry point** | Direct URL, or "Scan New Product" Quick Action from Dashboard |
| **Trigger** | Field inspection or spot-check |
| **Exit point** | Product Compliance Detail page, showing Compliant/Non-Compliant with rule citations |
| **What the user must feel at the end** | Confident, Accomplished |

**Steps:**

| Step # | User action | System response | What can go wrong | Designed recovery |
|--------|-------------|-----------------|-------------------|-------------------|
| 1 | Officer photographs/uploads a label image | Frontend validates file type/size before upload | Unsupported format or oversized file | Clear inline message naming accepted formats and the size limit |
| 2 | (System, automatic) | OCR extraction runs (Queued → Processing); record created with Compliance Status `Pending` | OCR fails entirely | Retry OCR action, or fallback offer to switch to Manual Entry |
| 3 | Officer reviews extracted fields against the source image, corrects any errors | Corrected fields are visually flagged "Corrected," distinct from low-confidence flags | A required field wasn't detected at all | Explicit "Not detected — please verify manually" flag, distinct from low confidence |
| 4 | Officer clicks "Confirm & Verify" | Verification Status → `Verified`; Compliance Status auto-computed (`Compliant`/`Non-Compliant`) | Required fields still missing | Action blocked with a message listing which fields are outstanding |
| 5 | Officer reviews the finalized Product Compliance Detail page | Violation Summary shows rule-cited findings, or explicit "No violations found" | — | — |

**Happy path summary (one sentence):**
> Officer photographs a label, the system extracts and checks all 10
> declaration categories, the officer verifies or corrects, and confirms —
> producing a citable compliant/non-compliant record with rule references.

---

### Journey 2 — Scan an E-commerce Listing (No Physical Photo) *(P2)*

| Field | Detail |
|-------|--------|
| **Persona** | Enforcement Officer |
| **Goal** | Check an online listing for compliance with no physical product in hand |
| **Entry point** | E-commerce Listing Scanner page, via Quick Action or direct nav |
| **Trigger** | Officer identifies a listing worth checking, or runs a routine sweep |
| **Exit point** | Same Extraction & Verification / Product Compliance Detail flow as Journey 1 |
| **What the user must feel at the end** | Confident this channel is no longer a blind spot |

**Steps:**

| Step # | User action | System response | What can go wrong | Designed recovery |
|--------|-------------|-----------------|-------------------|-------------------|
| 1 | Officer pastes a listing URL (single mode) | System fetches and shows a scraped preview (image + title) | Invalid or unreachable URL | Clear error message |
| 2 | Officer confirms the preview is the right product | Record created, tagged `E-commerce-Sourced`, Compliance Status `Pending` | URL doesn't resolve to a recognizable product | Explicit "Couldn't identify a product on this page" message |
| 3 | (System) | Feeds into the same extraction pipeline as Journey 1, step 2 onward | Platform blocks/rate-limits scraping | Explicit message naming this specific limitation |

**Happy path summary (one sentence):**
> Officer pastes a listing URL, confirms the scraped preview, and the
> listing enters the exact same extraction/verification flow as a
> physically-photographed scan.

---

### Journey 3 — Citizen Reports a Suspicious Label *(P3)*

| Field | Detail |
|-------|--------|
| **Persona** | Citizen / Public Reporter |
| **Goal** | Report a non-compliant label without creating an account |
| **Entry point** | QR code posted in-store, or direct portal URL |
| **Trigger** | Citizen notices a suspicious or non-compliant label while shopping |
| **Exit point** | Confirmation screen with a tracking reference number |
| **What the user must feel at the end** | Reassured that the report was received and matters |

**Steps:**

| Step # | User action | System response | What can go wrong | Designed recovery |
|--------|-------------|-----------------|-------------------|-------------------|
| 1 | Citizen photographs the label (only required field) | Frontend accepts photo, no login required | No photo attached, submit attempted | Inline validation — photo is the only required field |
| 2 | Citizen optionally adds context (what's wrong, store, contact) | All optional fields clearly marked as optional | Poor photo quality (blurry/dark) | Gentle retake suggestion — does NOT block submission |
| 3 | Citizen submits | Tracking reference generated and displayed; "what happens next" message shown | Submission fails (network) | Clear retry message, photo preserved, not lost |
| 4 | (Backend) | Enters the same extraction pipeline, tagged `Citizen-Reported`, defaults to `Pending` | — | — |

**Happy path summary (one sentence):**
> Citizen photographs a suspicious label, optionally adds context, submits
> with no account, and receives a tracking reference — the report enters
> the same pipeline as an officer scan.

---

## 6. SCOPE — PAGE & SCREEN INVENTORY

### 6.1 Sitemap

```
/ (Login — standalone, no shell)
├── /dashboard
├── /scan
│   └── /scan/:scanId → redirects to /verify/:scanId on completion
├── /verify/:scanId                      (Declaration Extraction & Verification)
├── /records                             (Compliance Records)
│   └── /records/:recordId               (Product Compliance Detail)
├── /analytics                           (Analytics & Violation Trends)
├── /ecommerce-scanner                   (E-commerce Listing Scanner)
├── /manufacturers/:manufacturerId       (Manufacturer Compliance Scorecard)
├── /reports                             (Reports & Profile)
└── /report-a-product                    (Citizen Grievance Portal — public, no shell)
```

> Route paths above are suggested, kebab-case, and not mandated by the PS —
> confirm/rename with your backend team before locking them in.

### 6.2 Page Inventory

| Page name | Route path (suggested) | Page type | Primary persona | Device priority | Primary CTA | BRD req. IDs |
|-----------|-----------|-----------|----------------|----------------|-------------|--------------|
| Login | `/` | Landing (auth) | All roles | Mobile + Desktop | Login | FR-AUTH-01, FR-AUTH-02 |
| Dashboard (+ shared shell) | `/dashboard` | Dashboard | Enforcement Officer | Desktop (demo), Mobile-capable | Scan New Product | FR-DATA-01, FR-NAV-01 |
| Scan / Upload Product | `/scan` | Form-step | Enforcement Officer | Mobile | Upload/Submit | FR-FILE-01–03, FR-FORM-01 |
| Declaration Extraction & Verification | `/verify/:scanId` | Detail (working view) | Enforcement Officer | Desktop (demo), Mobile-capable | Confirm & Verify | FR-DATA-02, FR-TRACK-01 |
| Compliance Records | `/records` | List | Enforcement Officer, Admin, Reviewer | Desktop | View | FR-SEARCH-01, FR-DATA-03 |
| Product Compliance Detail | `/records/:recordId` | Detail (final) | All roles | Desktop | Generate Compliance Report | FR-DATA-04, FR-TRACK-02 |
| Analytics & Violation Trends | `/analytics` | Dashboard (analytics) | Admin, Enforcement Officer, Reviewer | Desktop | Drill down to Records | FR-DATA-05 |
| E-commerce Listing Scanner | `/ecommerce-scanner` | Form-step | Enforcement Officer | Desktop + Mobile | Scan Listing / Scan Selected | FR-FORM-02 |
| Manufacturer Compliance Scorecard | `/manufacturers/:manufacturerId` | Detail (analytics) | Admin, Enforcement Officer, Reviewer | Desktop | Flag for Enforcement | FR-DATA-06 |
| Reports & Profile | `/reports` | Settings + form | All roles | Desktop | Generate Report | FR-FILE-04, FR-AUTH-03 |
| Citizen Grievance Portal | `/report-a-product` | Form-step (public) | Citizen | Mobile | Submit | FR-FORM-03 |

**Page types reference:**
`landing` / `form-step` / `detail` / `list` / `dashboard` / `confirmation` / `tracker` / `empty-state` / `error` / `settings` / `admin`

### 6.3 States Inventory

> Every page's full state list already exists in its own `Pages_Userflow/0N-*.md`
> file under "States & Edge Cases" — this table is a compressed cross-reference,
> not a replacement for those.

| Page | Loading | Empty | Error | Partial data | Success | Notes |
|------|---------|-------|-------|-------------|---------|-------|
| Login | ✓ | — | ✓ | — | ✓ | Session-expired state distinct from login failure |
| Dashboard | ✓ (per widget) | ✓ (zero data) | ✓ (per widget) | — | ✓ | One widget's error must not blank the whole page |
| Scan/Upload | ✓ | — | ✓ | ✓ (offline queue) | ✓ | Failed upload preserves entered metadata |
| Extraction & Verification | ✓ | — | ✓ (OCR failure) | ✓ (per-field confidence) | ✓ | Reopening a Verified record is read-only/reopen mode |
| Compliance Records | ✓ (skeleton rows) | ✓ (no results) | — | — | ✓ | Deep-link pre-filter must render correctly |
| Product Compliance Detail | — | ✓ (no evidence photos) | — | ✓ (unverified banner) | ✓ | Fully compliant shows explicit positive confirmation |
| Analytics | ✓ (per chart) | ✓ (insufficient data) | — | — | ✓ | — |
| E-commerce Scanner | ✓ | ✓ (zero listings found) | ✓ (invalid/blocked URL) | ✓ (partial batch failure) | ✓ | — |
| Manufacturer Scorecard | — | ✓ (zero products found) | — | ✓ (single-scan, no trend) | ✓ | — |
| Reports & Profile | ✓ (generation progress) | ✓ (no reports yet) | ✓ (generation failure) | — | ✓ | — |
| Citizen Grievance Portal | — | — | ✓ (submission failure) | — | ✓ | Status lookup has its own "not found" state |

### 6.4 Out of Scope

- **GIS map for regional analytics** — `Analytics & Violation Trends` explicitly uses a sortable table/bar chart, "deliberately not a GIS map for MVP" (`07-analytics-violation-trends.md`).
- **ML-based repeat-offender detection** — the Manufacturer Scorecard's repeat-violation flag is an explicit, documented threshold rule (3+ Non-Compliant in 90 days), not ML (`09-manufacturer-scorecard.md`).
- **Manufacturer name-variation matching** — spelling differences for the same manufacturer across scans are an explicitly documented known limitation, out of scope for MVP.
- **[TEAM TO CONFIRM]** whether multi-state/regional rollout is in scope for this build, or a single-DoCA-pilot demo (see §15 Q-05).

---

## 7. FUNCTIONAL REQUIREMENTS

### 7.1 Navigation

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-NAV-01 | Shared Sidebar/Header shell, built on Dashboard (first authenticated page), reused on every authenticated page | Must-have | Active-item highlight required |
| FR-NAV-02 | Product Compliance Detail is reached via a record link, not necessarily its own sidebar entry | Should-have | Per `02-dashboard.md` note |

### 7.2 Forms & Input

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-FORM-01 | Scan/Upload form: drag-drop + camera capture (mobile-first), multi-file support, manual-entry alternative to OCR | Must-have | Camera capture must be first-class, not buried |
| FR-FORM-02 | E-commerce Scanner: single-URL and bulk (category-page) modes, scraped preview before commit | Must-have | Reuses the same extraction pipeline, does not duplicate it |
| FR-FORM-03 | Citizen Grievance form: only the photo is required; all other fields explicitly optional | Must-have | Anonymous submission must feel equally legitimate |

### 7.3 Authentication & Sessions

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-AUTH-01 | Login supports Enforcement Officer / Admin / Reviewer roles | Must-have | Role is assigned server-side from credentials (§15 Q-01 resolved 2026-09-05). No role selector on the Login form. |
| FR-AUTH-02 | Session-expired state is visually distinct from a login failure | Must-have | — |
| FR-AUTH-03 | Role-based UI gating exactly matches the Role Permission Matrix in `00-README.md` | Must-have | Archive/bulk actions/rule thresholds = Admin only; Flag for Enforcement = Officer+Admin; Flag as Needs Review = all three roles |

### 7.4 Search

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-SEARCH-01 | Compliance Records: search by product name, manufacturer, or scan ID, plus 6 filter types, all visible with removable chips | Must-have | — |

### 7.5 Notifications & Alerts

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-NOTIFY-01 | Dashboard alerts: violation spikes and repeat-offender flags, each deep-linking to filtered Records or Scorecard | Must-have | Alert severity must map to the correct status token, not default to "error" |
| FR-NOTIFY-02 | Header notification icon with unread count | Should-have | Channel beyond in-app (email/SMS) — **[TEAM TO CONFIRM]**, see §15 Q-08 |

### 7.6 Data Display

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-DATA-01 | Dashboard: 4 KPI cards (Products Scanned, Compliant, Non-Compliant, Pending), each clickable to pre-filtered Records | Must-have | "Pending" specifically means awaiting verification |
| FR-DATA-02 | Extraction & Verification: per-field confidence (percentage + High/Medium/Low band), font-size/readability pass-fail as a distinct check | Must-have | This is the PS's core-ask page — highest build priority |
| FR-DATA-03 | Compliance Records table: thumbnail, product, manufacturer, date, status pill, violation count, source tag, last updated | Must-have | — |
| FR-DATA-04 | Product Compliance Detail: Violation Summary cites specific rule numbers using the canonical taxonomy wording exactly | Must-have | Fully-compliant records show explicit positive confirmation |
| FR-DATA-05 | Analytics: violation-type breakdown uses the exact 10-category canonical taxonomy, every chart/row drill-down clickable | Must-have | — |
| FR-DATA-06 | Manufacturer Scorecard: compliance-rate trend, repeat-violation flag (documented threshold), violation-type breakdown scoped to one manufacturer | Must-have | Single-scan manufacturers must not get a misleading trend line |

### 7.7 File Handling

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-FILE-01 | Accepted upload formats: JPG, JPEG, PNG, PDF | Must-have | Directly stated in `03-scan-upload.md` |
| FR-FILE-02 | Maximum file size: **[TEAM TO CONFIRM]** — spec says "state the max size limit visibly" but doesn't give a number (§15 Q-04) | Must-have | Suggested default: 10 MB/file, pending confirmation |
| FR-FILE-03 | Duplicate-image detection with a warning + "proceed anyway"/"view existing scan" options | Should-have | — |
| FR-FILE-04 | Report export: PDF *and* at least one editable format (Word/Excel) — "and," not "or" | Must-have | PS explicitly requires both, not PDF-only |

### 7.8 Payment (if applicable)

N/A — no payment flow exists anywhere in the PS or the page spec.

### 7.9 Tracking & Status

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-TRACK-01 | Verification Status (`Extracted`/`Verified`) and Compliance Status (`Pending`/`Compliant`/`Non-Compliant`/`Needs Review`) are tracked as two separate fields, never visually conflated | Must-have | See the Status Model in `00-README.md` — this is the single most important data-model rule in the spec |
| FR-TRACK-02 | Audit trail / history timeline on Product Compliance Detail: Scanned → Extracted → Corrected → Verified → Report Generated → Flagged (if applicable) | Must-have | Each entry timestamped and attributed |
| FR-TRACK-03 | Citizen status lookup: coarse public status (Received/Under Review/Resolved), never exposing internal officer/workflow detail | Should-have | Distinct vocabulary from internal Compliance Status |

### 7.10 Content Management

N/A for editable content — the violation taxonomy is a fixed rule set tied to
legislation, not CMS content. The one configurable item is the repeat-offender
threshold (Admin-only, per the Role Permission Matrix's "Manage rule
thresholds (stretch feature)" row).

### 7.11 Multilingual

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-I18N-01 | Languages at launch: English only; Hindi scaffolded and enabled when its translation is complete | Must-have | §15 Q-03 resolved 2026-09-05. Locale routing supports both from the start; the switcher lists only completed locales. |
| FR-I18N-02 | Languages at v2 | Should-have | **[TEAM TO CONFIRM]** |
| FR-I18N-03 | RTL support required | — | Not indicated as needed; confirm if Urdu is added at v2 |

---

## 8. NON-FUNCTIONAL REQUIREMENTS

### 8.1 Performance

| Metric | Target | Context |
|--------|--------|---------|
| LCP (Largest Contentful Paint) | < 2.5s | 4G mobile — matters given Officer/Citizen personas are mobile-first |
| CLS (Cumulative Layout Shift) | < 0.1 | All devices |
| INP (Interaction to Next Paint) | < 200ms | All devices |
| Full page load | < 3s | 4G mobile |
| Time to interactive | < 4s | 4G mobile |

### 8.2 Availability & Scale

| Metric | Target |
|--------|--------|
| Uptime | 99.9% (standard target — **[TEAM TO CONFIRM]** for a hackathon prototype vs. eventual production) |
| Peak concurrent users | **[TEAM TO CONFIRM]** — not stated in PS |
| Load handling | **[TEAM TO CONFIRM]** |
| Recovery time objective (RTO) | **[TEAM TO CONFIRM]** |

### 8.3 Security

| Requirement | Detail |
|-------------|--------|
| Authentication method | **[TEAM TO CONFIRM]** — Login spec only says "username or email field," doesn't specify Aadhaar/SSO/plain credentials (§15 Q-06) |
| Session timeout | **[TEAM TO CONFIRM]** exact minutes — WCAG A-11 requires a warning before expiry regardless; suggested default 30 min |
| PII handling | Citizen contact info is explicitly optional and never required (`11-citizen-grievance-portal.md`) — requiring it "would suppress submissions" |
| Data in transit | HTTPS / TLS 1.2+ minimum |
| CERT-In compliance | **[TEAM TO CONFIRM]** — likely Yes given GoI hosting, not explicitly stated |
| No PII in URLs | Required |

### 8.4 Browser & Device Support

| Platform | Browsers | Notes |
|----------|---------|-------|
| Android (Chrome) | Last 2 versions | **Primary** — Enforcement Officer and Citizen personas are both mobile-first |
| iOS (Safari) | Last 2 versions | |
| Windows (Chrome, Firefox, Edge) | Last 2 versions | Admin/Reviewer desktop use |
| macOS (Safari, Chrome) | Last 2 versions | |
| Samsung Internet | Last 2 versions | Significant Indian market share |

Minimum supported viewport: 320px wide.

### 8.5 Analytics

| Requirement | Detail |
|-------------|--------|
| Analytics platform | **[TEAM TO CONFIRM]** |
| Key events to track | Scan started/completed, Confirm & Verify performed, report generated, citizen report submitted |
| Funnels to measure | Dashboard → Scan → Verify → Compliance Detail; Citizen QR scan → submission → confirmation |
| Third-party tracking | Requires explicit MeitY approval per GoI policy |

---

## 9. CONTENT REQUIREMENTS

### 9.1 Language Plan

| Locale | Language | Script | Status at launch | Status at v2 | Est. coverage needed |
|--------|----------|--------|-----------------|-------------|---------------------|
| `en` | English | Latin | ✅ Active | ✅ Active | 100% |
| `hi` | Hindi | Devanagari | **[TEAM TO CONFIRM]** | ✅ likely | — |
| Other regional | — | — | ❌ | **[TEAM TO CONFIRM]** | — |

> Neither the PS nor the page spec states the launch language list. This is
> the single open item most likely to block `IMPLEMENTATION_GUIDE.md`'s Step 0
> BRD gate, since it's explicitly one of the questions Claude Code is
> instructed to ask before Phase 1 (see §15 Q-03).

### 9.2 Plain Language Standard

| Field | Value |
|-------|-------|
| Target reading level | Class 8 (typical GoI plain-language convention) — **[TEAM TO CONFIRM]** |
| Terminology rules | Use the fixed vocabulary from `00-README.md` verbatim (status values, role names, taxonomy categories) — never paraphrase these specific terms |
| Tone of voice | Formal and authoritative, but not intimidating — directly grounded in the Login page's framing: "needs to read as secure and official, not like a consumer SaaS sign-in" |

### 9.3 Content Types & Taxonomy

| Content type | Examples | Owner | Update frequency | Expiry rule | Archive rule |
|-------------|---------|-------|-----------------|------------|-------------|
| Violation taxonomy (10 categories) | "MRP Non-Compliance," "Font Size / Readability Failure," etc. | DoCA / rules team | Static, changes only if the Rules change | N/A | N/A |
| Compliance records | One per scan | System-generated | Created per scan | **[TEAM TO CONFIRM]** retention period (§15 Q-04) | Admin-only archive action |
| Generated reports | PDF/Word/Excel exports | System-generated | On demand | **[TEAM TO CONFIRM]** | Kept in Download History |

### 9.4 Mandatory Content

| Content | Required on | Authority |
|---------|------------|-----------|
| Copyright notice | Footer — all pages | GoI policy |
| Accessibility statement | Footer / dedicated page | GIGW 3.0 |
| Privacy policy link | Footer — all pages | IT Act |
| RTI information | Footer / dedicated page | RTI Act |
| Last updated date | Footer — all pages | GIGW 3.0 |
| Screen reader access | Header — all pages | GIGW 3.0 |
| Department of Consumer Affairs attribution + emblem | Login and Citizen Grievance Portal | GIGW branding convention; explicitly required as a "trust signal" in both `01-login.md` and `11-citizen-grievance-portal.md` |

### 9.5 CMS Requirements

| Requirement | Detail |
|-------------|--------|
| CMS needed | No — content is either system-generated (records/reports) or a fixed rule set (taxonomy) |
| Content editable without developer | Repeat-offender threshold value (Admin-only, per Role Permission Matrix) |
| Content scheduling | No |
| Emergency banner capability | **[TEAM TO CONFIRM]** — not mentioned in spec |
| Multi-author workflow | No |
| Content approval workflow | No |

---

## 10. INTEGRATION REQUIREMENTS

### 10.1 Backend Systems

| System | Purpose | Integration type | Auth method | Notes |
|--------|---------|-----------------|------------|-------|
| OCR/extraction pipeline | Extracts declaration fields from label images/listings | API | — | Explicitly a backend responsibility — frontend consumes via API, per PS's docx note: "OCR, database operations and analytical calculations remain backend responsibilities" |
| E-commerce scraping service | Retrieves listing images/title/description from a pasted URL | API | — | Feeds into the same extraction pipeline as a physical scan |
| Legal Metrology rule engine | Computes pass/fail per declaration against the 10-category taxonomy | API | — | — |

### 10.2 Authentication

| Field | Detail |
|-------|--------|
| Method | **[TEAM TO CONFIRM]** — see §15 Q-06; Login spec only specifies "username or email field," not the underlying auth provider |
| Required for | All pages except Citizen Grievance Portal (public, no login) |
| Guest access | Citizen Grievance Portal only — submission + status lookup, no account required |
| Session handling | See §8.3 |

### 10.3 Payment (if applicable)

N/A — no payment flow anywhere in scope.

### 10.4 Notifications

| Channel | In scope | Trigger events | Provider |
|---------|---------|---------------|---------|
| In-app / browser | Yes | Dashboard alerts, unread notification count | — |
| Email | **[TEAM TO CONFIRM]** | — | — |
| SMS | **[TEAM TO CONFIRM]** | — | — |
| WhatsApp | **[TEAM TO CONFIRM]** | — | — |

### 10.5 Document & Data Pre-fill

Not specified in the PS or page spec — no DigiLocker or existing-profile
pre-fill is mentioned anywhere. **[TEAM TO CONFIRM]** if this is needed.

### 10.6 File Handling

| Field | Detail |
|-------|--------|
| Accepted upload formats | JPG, JPEG, PNG, PDF |
| Maximum file size | **[TEAM TO CONFIRM]** — see §15 Q-04; suggested default 10 MB/file pending confirmation |
| Virus scanning | **[TEAM TO CONFIRM]** — recommended Yes for a government upload system, not stated in spec |
| Storage | **[TEAM TO CONFIRM]** — typically NIC cloud for a GoI system, not stated |
| Retention period | **[TEAM TO CONFIRM]** — enforcement records likely need multi-year retention to remain citable, but no specific number is given anywhere |

---

## 11. DESIGN & BRAND REQUIREMENTS

> **This section is the primary input to Phase 1's `tokens.css`/`brand.css`
> generation and the primary gate `IMPLEMENTATION_GUIDE.md` checks before
> writing any code.** Recommended defaults are provided below so this gate
> can be answered immediately with "use UX4G default" — a fully legitimate,
> explicitly sanctioned answer per `SKILL.md` — rather than blocking on a
> real brand exercise your team likely doesn't have time for. Override any
> row where you do have a real preference.

### 11.1 Design System

| Field | Value |
|-------|-------|
| **Design system** | UX4G (ux4g.gov.in) — mandatory for all GoI digital products |
| **UX4G compliance level** | Full compliance required |
| **Component library** | UX4G Figma component library / `ux4g-web-components` npm package |

### 11.2 Brand Identity

| Field | Detail |
|-------|--------|
| **Brand name** | **Digi-Pramaan** — CONFIRMED by the team on 2026-09-05, exercising the rename this row invited. Rendered as the name, with "Legal Metrology Compliance System" as the descriptor beneath it. Both strings live in `src/messages/en.json` under `app.name` and `app.descriptor`; nothing hard-codes either. |
| **Brand adjectives** | Authoritative, Trustworthy, Clear, Efficient, Accessible |
| **Visual tone** | Formal/institutional |
| **Brand rationale** | Directly grounded in spec language: the Login page "needs to read as secure and official, not like a consumer SaaS sign-in," and officers use it "repeatedly during fieldwork and live demonstrations, so it needs to be fast and unambiguous under pressure" (`01-login.md`) |

> **DEFAULT — CONFIRM OR OVERRIDE.** The five adjectives above are a
> reasonable starting point derived from the spec's own tone descriptions,
> not a finished brand exercise. Confirm or adjust with the team before this
> is treated as final.

### 11.3 Colour

| Colour role | Value | Source / justification |
|-------------|-------|----------------------|
| **Primary (main CTA, active states)** | UX4G default | No custom brand colour is specified anywhere in the PS or page spec |
| **Secondary (supporting actions, accents)** | UX4G default | Same |
| **Tertiary / accent** | UX4G default | Same |
| **Page background** | UX4G default | Same |
| **Card surface** | UX4G default | Same |
| **Primary text** | UX4G default | Same |
| **Link colour** | UX4G default | Same |

> **DEFAULT — CONFIRM OR OVERRIDE.** This is the exact answer `SKILL.md`
> explicitly sanctions offering: "give the user an explicit option to
> continue with the default UX4G theme without providing custom colours."
> If DoCA/NeGD has an actual required palette, replace this table before
> Phase 1 — otherwise, this row is answered and Claude Code should not need
> to ask again.

Dark mode: **Shipped.** Reversed from the original "not required for MVP"
default — a full light/dark theme system (system-preference-following,
manual override persisted per device, applied consistently across the
landing page, officer shell, and capture flow) was built and verified
working across the app. Confirmed by the team.

### 11.4 Typography

| Field | Detail |
|-------|--------|
| **Primary typeface** | UX4G default (Noto Sans) — mandatory, don't substitute |
| **Heading style** | UX4G default |
| **Body size** | 16px default |
| **Regional scripts needed** | Per §9.1 — English confirmed; others pending §15 Q-03 |

### 11.5 Shape

| Field | Choice | Justification |
|-------|--------|---------------|
| **Corner radius style** | Moderate (4–8px) | Matches DESIGN_SYSTEM.md §10's "minimal elegant" government-service guidance — recommended default |
| **Elevation style** | Subtle — light shadows | Same |
| **Border style** | Subtle borders | Same; DESIGN_SYSTEM.md §10 recommends border over shadow for adjacent same-level surfaces |

**DEFAULT — CONFIRM OR OVERRIDE.**

### 11.6 Iconography

| Field | Choice |
|-------|--------|
| **Icon style** | Outline |
| **Domain-specific icons needed** | None currently flagged as a gap in `COMPONENT_SPEC.md` |

### 11.7 Photography & Illustration

| Field | Detail |
|-------|--------|
| **Photography style** | None as decorative imagery — this is a utility tool, not a marketing site. Where images appear, they are the actual user-scanned product photos, not stock photography |
| **Illustration style** | Flat vector, matching UX4G's own `Empty State` component |
| **Asset source** | N/A — no stock/AI-generated imagery needed |

### 11.8 Motion & Density

| Field | Choice | Justification |
|-------|--------|---------------|
| **Motion personality** | Subtle/functional | DESIGN_SYSTEM.md §10's recommended default absent a stated preference |
| **Layout density** | **Compact** for Dashboard/Records/Analytics/Scorecard (admin/officer-facing); **Comfortable** for the Citizen Grievance Portal | Directly reflects the internal-vs-public split already built into the page spec (page 11 has no shell, is explicitly public-facing) |

### 11.9 Existing Reference

| Reference | Influence type | What to take / what to avoid |
|-----------|---------------|------------------------------|
| GOV.UK / USDS (referenced generically in `PAGE_COMPOSITION.md` as a quality bar) | Positive | Take: compositional discipline, task-first layout. Avoid: their specific colour palette — UX4G's is mandatory here |

---

## 12. ACCESSIBILITY REQUIREMENTS

| ID | Requirement | Standard | Notes |
|----|-------------|----------|-------|
| A-01 | WCAG 2.1 Level AA compliance on all pages | WCAG 2.1 | Non-negotiable |
| A-02 | All images have meaningful alt text | WCAG 1.1.1 | Includes uploaded label photos and evidence attachments |
| A-03 | No auto-playing or auto-scrolling content without pause control | WCAG 2.2.2 | — |
| A-04 | Text contrast ≥ 4.5:1 normal, 3:1 large | WCAG 1.4.3 | Both light and dark mode |
| A-05 | All interactive elements keyboard navigable with visible focus | WCAG 2.4.7 | — |
| A-06 | All form fields have associated visible labels | WCAG 1.3.1 | — |
| A-07 | Error messages describe the fix, not just the error | WCAG 3.3.1 | e.g. "Enter a file under 10 MB," not "Invalid file" |
| A-08 | Skip to main content link functional | WCAG 2.4.1 | — |
| A-09 | Touch targets ≥ 44×44px | WCAG 2.5.5 | Especially important on Scan/Upload — officer often working one-handed in the field |
| A-10 | No information conveyed by colour alone | WCAG 1.4.1 | — |
| A-11 | Session timeout warns user before expiry with extension option | WCAG 2.2.1 | — |
| A-12 | PDFs linked from the site must be tagged accessible | WCAG 1.3.1 | Applies to generated compliance reports |
| A-13 | Site tested with NVDA+Chrome and VoiceOver+Safari | Manual test | Before launch |
| A-14 | Status/violation information is never conveyed by colour alone — every status pill/badge pairs a status token with an icon and a visible text label | WCAG 1.4.1 | Product-specific addition — directly reinforces the fixed-vocabulary rule in `00-README.md`, which explicitly bans paraphrasing or color-only status signaling |

---

## 13. CONSTRAINTS

### 13.1 Design Constraints

| Constraint | Detail | Source |
|------------|--------|--------|
| UX4G components and tokens only | No raw hex/px in application code, no competing styling framework (no Tailwind) | `CLAUDE.md` non-negotiables |
| Fixed status/role/taxonomy vocabulary | Must be used verbatim across every page — never paraphrased | `Pages_Userflow/00-README.md` |

### 13.2 Technical Constraints

| Constraint | Detail |
|------------|--------|
| Hosting | **[TEAM TO CONFIRM]** — not stated in PS; typically NIC/gov cloud for a GoI system |
| Framework | Next.js (App Router), TypeScript strict — this BRD does **not** override `IMPLEMENTATION_GUIDE.md`'s default; confirm here only if your team needs a different stack |
| External CDN | Allowed — UX4G itself ships via a sanctioned pinned CDN as one of its two delivery methods |
| Cookies | **[TEAM TO CONFIRM]** consent requirements |
| Open-source policy | **[TEAM TO CONFIRM]** — likely N/A for a hackathon prototype |

### 13.3 Timeline Constraints

| Constraint | Detail |
|------------|--------|
| Hard launch date | **[TEAM TO CONFIRM]** — SIH 2026 Grand Finale demo date |
| Phased rollout | No — single hackathon build |
| Application windows that cannot be disrupted | N/A — this is a prototype, not a live production system with existing users |

### 13.4 Content Constraints

None identified in the PS or page spec. **[TEAM TO CONFIRM]** if any exist.

---

## 14. RISKS

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|-----------|--------|------------|-------|
| R-01 | OCR/extraction accuracy is a hard dependency the frontend can't control | Medium | High | Low-confidence flagging UI and officer correction workflow already spec'd as a safety net (page 4) | [Fill in] |
| R-02 | Manufacturer name-variation matching is out of scope for MVP — could undercount repeat offenders | High | Medium | Documented known limitation, already flagged in the Scorecard's UI copy | [Fill in] |
| R-03 | E-commerce platforms may block/rate-limit scraping | Medium | Medium | Explicit "rate-limited" state already spec'd; doesn't block the rest of a batch | [Fill in] |
| R-04 | Login role-handling approach (selector vs. backend-assigned) is still undecided, blocking Dashboard/Sidebar visibility logic | High (currently unresolved) | High | Resolve as the first §15 open question before Phase 1 begins | [Fill in] |
| R-05 | Brand colour / language-plan decisions (§11.3, §9.1) unresolved could stall Phase 1 if not answered before the build starts | Medium | Medium | This BRD pre-answers §11.3 with the sanctioned UX4G-default fallback; only §9.1 needs a quick team decision | [Fill in] |

---

## 15. OPEN QUESTIONS

*Every item below is something the PS and the page spec genuinely leave
unanswered — not guessed. Resolve the P1s before Phase 1 of the build.*

| ID | Question | Impact on design | Priority | Owner | Due date | Resolution |
|----|----------|-----------------|----------|-------|----------|------------|
| Q-01 | Login role handling: role selector (officer picks) vs. role assigned server-side from credentials? | Blocks Dashboard/Sidebar visibility logic — `01-login.md` itself says "Decide and document which approach you're using now" | P1 | Team | 2026-09-05 | **RESOLVED — backend-assigned from credentials.** No role selector on Login; the page shows a caption stating access level is set by the account. Matches `01-login.md` §3 step 5, where the backend returns session token plus role. Implemented in `src/types/user.ts`; three seeded accounts, one per role, in `src/lib/mock/users.ts`. |
| Q-02 | Do DoCA/NeGD require a specific brand palette, or is UX4G default acceptable? | Gates Phase 1's `tokens.css`/`brand.css` generation | P1 | | | *(Pre-answered with UX4G default in §11.3 — confirm or override)* |
| Q-03 | Which languages beyond English are required at launch vs. v2? | Gates `messages/` i18n setup in Phase 1 | P1 | Team | 2026-09-05 | **RESOLVED — English only at launch, Hindi scaffolded.** Locale routing carries both from day one; `hi.json` is generated from `en.json` and kept in step by `scripts/sync-locales.mjs`. The switcher offers only what `NEXT_PUBLIC_ACTIVE_LOCALES` lists, so Hindi ships when its translation is complete, not before. |
| Q-04 | Maximum upload file size, and record/report retention period | `03-scan-upload.md` says to state the limit visibly but doesn't give the number | P2 | | | |
| Q-05 | Is state-level/regional deployment in scope, or a central DoCA pilot only? | Affects the "Inspection region/state" field's value list | P2 | | | |
| Q-06 | What is the actual authentication method (Aadhaar-linked, department SSO, or plain credentials)? | Login page only specifies "username or email field" | P2 | | | |
| Q-07 | Do you have any real manual-inspection baseline data, or should §3.2's metrics stay illustrative for the demo? | Affects whether §3.2 is presentable to judges as real numbers | P3 | | | |
| Q-08 | Are notification channels beyond in-app (email/SMS/WhatsApp) required at launch? | Scopes FR-NOTIFY-02 | P3 | | | |

---

## 16. TIMELINE & MILESTONES

> Dates are **[TEAM TO FILL]** — durations depend on your actual SIH 2026
> schedule, which isn't stated anywhere in the source material. The
> "Key deliverables" column is not a guess, though — it's mapped directly to
> `IMPLEMENTATION_GUIDE.md`'s own 6-phase build order, so this table can be
> used as-is once you drop in real dates.

| Phase | Duration | Key deliverables | Dependencies |
|-------|----------|-----------------|-------------|
| 0 — Discovery | | Resolve §15 P1 open questions (Q-01, Q-02, Q-03) | This BRD |
| 1 — Foundation | | Project structure, `tokens.css`/`brand.css` (real UX4G token names, confirmed not guessed), mock data, i18n scaffolding | Phase 0 |
| 2 — Layout shell | | Navbar/Header/Footer/Sidebar built on Login + Dashboard | Phase 1 |
| 3 — P1 journey pages | | Login → Dashboard → Scan/Upload → Extraction & Verification (protect this page's time — it's the PS's core ask) → Product Compliance Detail | Phase 2 |
| 4 — Remaining pages | | Compliance Records, Analytics, E-commerce Scanner, Manufacturer Scorecard, Reports & Profile, Citizen Grievance Portal | Phase 3 |
| 5 — States and edges | | Loading/error/empty states for every page, global 404, offline handling | Phase 4 |
| 6 — Final audit & polish | | Full accessibility + visual QA pass across all 11 pages, cross-page consistency check | Phase 5 |

---

## 17. APPENDIX

### 17.1 Glossary

| Term | Definition |
|------|-----------|
| MRP | Maximum Retail Price — one of the mandatory declarations under the Rules |
| Legal Metrology (Packaged Commodities) Rules, 2011 | The regulation this system checks compliance against |
| Declaration | A single mandatory piece of label information (e.g. net quantity, MRP, manufacturer address) |
| Verification Status | Internal workflow state: `Extracted` or `Verified` — distinct from Compliance Status |
| Compliance Status | The 4-value status shown throughout the app: `Pending` / `Compliant` / `Non-Compliant` / `Needs Review` |
| Needs Review | A manual escalation flag, applied by any of the three roles, that overrides the auto-computed status |
| Canonical Violation Taxonomy | The fixed 10-category list of possible violations, used identically across 4 pages |
| DoCA | Department of Consumer Affairs |
| NeGD | National e-Governance Division — owns the UX4G Design System |
| UX4G | The mandatory GoI design system this product's frontend is built on |

### 17.2 Current State Audit (if revamp)

N/A — this is a new product; no existing digital system is being replaced.

### 17.3 Related Documents

| Document | Location | Relevance |
|---------|----------|----------|
| Official Problem Statement | `SIH26034.md` | Source of the regulatory/functional requirement |
| Pages_Userflow (11-page functional spec) | `Pages_Userflow/00-README.md` onward | Source of the Status Model, taxonomy, role matrix, and every page's detailed spec |
| UX4G Design System contract | `docs/Design.md` | Design system reference — authoritative for tokens/components |
| ux4g-design skill | `.claude/skills/ux4g-design/` | Operational build contract Claude Code follows |
| GIGW 3.0 Guidelines | ux4g.gov.in / MeitY | Compliance |

### 17.4 Stakeholder Sign-off

| Stakeholder | Role | Signature | Date |
|-------------|------|-----------|------|
| | Product owner | | |
| | Design lead | | |
| | Technical lead | | |
| | Accessibility reviewer | | |
| | Legal / compliance | | |

---

*End of document.*

*This BRD is a living document. All changes must be version-controlled in
the Document Control table and communicated to the team. §15's open
questions should be resolved — or explicitly deferred with a reason — before
treating this as version 1.0.*