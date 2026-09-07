# Addendum — Extraction Transparency, Report Export, History & Hierarchical Management

> Companion to `00-README.md` and `03-scan-upload.md`. Read both first. This
> file covers additions that touch **multiple existing pages** rather than
> being one new page of their own: additions to Declaration Extraction &
> Verification (page 4), additions to Reports & Profile (page 10), a new
> History/Audit Trail surface, and a new Hierarchical (jurisdiction)
> management layer with one new Admin Console page.
>
> The Scan Capture Wizard, mobile handoff, quality gate, and Processing
> Pipeline Tracker live in `03-scan-upload.md`, not here.

---

## 1. Extraction & Verification page — additions to Page 4

### 1.1 Per-field source transparency

Each declaration row already shows value / confidence band / corrected
flag. Add:
- A small badge showing which image it came from (Front / Back /
  Side-PDP) — clicking it highlights or opens that thumbnail
- A small badge showing which engine produced it (PaddleOCR / Gemini
  fallback / Manual entry) — a trust feature so officers know when
  they're looking at a second-opinion read rather than the primary
  pipeline's own result

Nothing about the existing Confirm & Verify / Flag as Needs Review
actions, or the Verification Status model, changes.

### 1.2 Compliance Score (new, additive — does not replace Compliance Status)

The existing four-value `ComplianceStatus` stays exactly as defined in
`00-README.md` §A — this is a second, numeric signal shown alongside it
once Verification Status is `Verified`, not a replacement.

- **Definition**: 0–100, computed from the proportion of applicable
  mandatory fields that passed, weighted so a missing mandatory
  declaration counts for more than a font-size shortfall. Exact weights
  are a backend/rule-engine decision — the frontend renders whatever
  number and per-category breakdown the API returns; don't hardcode a
  formula.
- **Display**: numeric score + a qualitative band for scanning (e.g.
  90–100 "Excellent", 70–89 "Good", 40–69 "Poor", <40 "Critical" —
  placeholder wording, confirm exact bands/labels before shipping) shown
  on Product Compliance Detail, Compliance Records (sortable column),
  Analytics, and Manufacturer Scorecard — the same four places
  Compliance Status already appears.
- **Relationship to Compliance Status**: Compliance Status governs
  filtering/workflow. Compliance Score is a finer-grained severity signal
  *within* Compliant or Non-Compliant — two Non-Compliant products can
  have very different scores, and that distinction matters for
  prioritizing enforcement.

```ts
export interface ComplianceScore {
  value: number;              // 0-100
  band: "Excellent" | "Good" | "Poor" | "Critical"; // placeholder wording, confirm before ship
  breakdownByCategory: Partial<Record<ViolationCategoryId, number>>;
}
```

```ts
// scan.ts — ExtractedDeclaration gains:
export interface ExtractedDeclaration {
  // ...existing fields unchanged...
  sourceEngine: "paddleocr" | "gemini_fallback" | "manual";
  sourceImageAngle: "front" | "back" | "side_pdp";
}
```

---

## 2. Report Preview & Export — addition to Page 10 (Reports & Profile)

Before a report is exported, add a preview step:
- Rendered in-browser preview of the PDF layout — not a "Download" button
  firing blind
- Editable-format export alongside PDF (the PS explicitly asks for
  "editable formats" — .docx is the safe default; confirm with Karan
  whether a second format is also wanted)
- Officer attribution block on the report: name, role, region, date
  verification was completed — pulled from the record's audit trail
  (§3), not re-entered
- A verification reference code or QR on the PDF itself, so a printed
  report can be checked against the system later — flag as a stretch
  item if backend support isn't ready, don't block the base export flow
  on it

---

## 3. History & Audit Trail (new)

Two surfaces, same underlying data.

### 3.1 Per-record timeline (embedded on Product Compliance Detail, as a
tab: "History")

A vertical timeline of every event on that specific record:
- Scan created (by whom, capture mode used, source tag)
- Each image quality check attempt, including failed ones with the
  reason — this is where a rejected/deleted image's failure is
  preserved even though the image itself is gone
- OCR started/completed per pipeline stage, with which engine handled
  which fields
- Every correction made during verification — old value → new value,
  field, user, timestamp
- Confirm & Verify performed
- Flag as Needs Review applied, with any note attached
- Report generated / exported / downloaded, and by whom
- Archived (Admin only), if applicable

### 3.2 Global Activity Log (new page, Admin + Reviewer)

A filterable, searchable feed across *all* records — by user, action
type, date range, region/jurisdiction. This is the accountability
surface: "show me everything Officer X did last week," "show me every
Flag as Needs Review in Maharashtra this month." Reviewer's read-only,
oversight role makes this page a natural fit alongside Analytics and
Manufacturer Scorecard, which Reviewer already has access to.

### 3.3 New type (`src/types/history.ts` — new file)

```ts
import type { Role } from "./vocabulary";

export const AUDIT_EVENT_TYPES = [
  "scan_created",
  "image_quality_failed",
  "image_quality_passed",
  "ocr_completed",
  "ocr_fallback_used",
  "llm_structuring_completed",
  "rule_engine_completed",
  "field_corrected",
  "confirm_and_verify",
  "flagged_needs_review",
  "flagged_for_enforcement",
  "report_generated",
  "report_downloaded",
  "record_archived",
  "case_reassigned",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditEvent {
  id: string;
  recordId: string;
  type: AuditEventType;
  actorUserId?: string;   // absent for system-generated events
  actorRole?: Role;
  detail?: string;
  fieldId?: string;       // present for field_corrected
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}
```

---

## 4. Hierarchical Management

DoCA enforcement runs Central → State → District. The existing three-role
model (Enforcement Officer / Admin / Reviewer) is a **permission**
dimension, not an **organizational** one. Add jurisdiction as a second,
orthogonal dimension rather than multiplying roles — this keeps the
existing Role Permission Matrix in `00-README.md` §C valid as-is.

### 4.1 Model

```ts
export const JURISDICTION_LEVELS = ["National", "State", "District"] as const;
export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

export interface Jurisdiction {
  id: string;
  level: JurisdictionLevel;
  name: string;
  parentJurisdictionId?: string; // District → State → National
}
```

`User` (existing, `src/types/user.ts`) gains:

```ts
export interface User {
  // ...existing fields unchanged...
  jurisdictionId: string;
  reportsToUserId?: string;
}
```

### 4.2 What jurisdiction changes, concretely

- **Data visibility scopes automatically by jurisdiction, not just role.**
  A District Admin sees only their district's records on Dashboard,
  Compliance Records, Analytics, Manufacturer Scorecard. A State Admin
  sees their state (districts individually filterable). A National Admin
  sees everything. Enforcement Officers always see their own cases
  regardless of their account's jurisdiction level, plus, if their Admin
  has granted it, their district's shared queue.
- **Case assignment/reassignment.** An Admin at or above a case's
  jurisdiction can reassign it between Enforcement Officers within their
  scope — for workload balancing and covering unavailable officers.
  Produces a `case_reassigned` audit event.
- **Escalation path.** "Flag as Needs Review" (unchanged in behavior)
  becomes organizationally meaningful: a District Admin can manually
  reassign it to a specific higher-jurisdiction Admin. This is a manual
  action, not automatic routing — automatic escalation rules are a later
  stretch feature, not part of this addendum.
- **Roll-up dashboards.** Dashboard KPIs get an optional jurisdiction
  breakdown for State/National Admins — a table (no GIS map, per the
  locked decision to exclude mapping from MVP), sortable by
  non-compliance rate, to spot which districts need attention.

### 4.3 New page — Admin Console (Admin only)

One page with tabs, rather than three separate pages:

- **Tab: Team & Jurisdiction** — org list of users within the current
  Admin's jurisdiction and sub-jurisdictions: name, role, jurisdiction,
  case load, last active. Actions: reassign a user's jurisdiction,
  reassign cases between officers, deactivate a user (Admin-only, same
  pattern as existing Archive actions elsewhere).
- **Tab: Rule Thresholds** — the existing matrix's stretch item "Manage
  rule thresholds": OCR confidence threshold that triggers Gemini
  fallback, font-size tolerance if any, compliance score band cutoffs, and
  the **repeat-violation threshold** (`REPEAT_VIOLATION_THRESHOLD` in
  `src/types/manufacturer.ts` — 3 Non-Compliant records within 90 days,
  what the Manufacturer Scorecard flags on). That one is a frozen constant
  today; its own doc comment already calls it Admin-editable per BRD §9.5,
  and this tab is where that edit path belongs rather than a second,
  competing settings mechanism built for one number.
  Changes here should themselves be audit-logged (add
  `rule_threshold_changed` to `AuditEventType` when this ships).
- **Tab: System** — active locales, max upload size (already a
  documented placeholder in `scan.ts`), other environment-level settings
  currently hardcoded via env vars. Lower priority — build last.

---

## 5. Updated full page list

| # | Page | Notes |
|---|---|---|
| — | Landing | Built |
| 1 | Login | — |
| 2 | Dashboard (+ shell) | — |
| 3 | Scan Capture Wizard | See `03-scan-upload.md` |
| — | Mobile Capture Companion | See `03-scan-upload.md` |
| — | Processing Pipeline Tracker | See `03-scan-upload.md` |
| 4 | Declaration Extraction & Verification | + §1 additions here |
| 5 | Compliance Records | + Compliance Score column |
| 6 | Product Compliance Detail | + History tab, §3.1 |
| 7 | Analytics & Violation Trends | + jurisdiction breakdown |
| 8 | E-commerce Listing Scanner | Unchanged |
| 9 | Manufacturer Compliance Scorecard | Unchanged |
| 10 | Reports & Profile | + §2 preview/export |
| 11 | Citizen Grievance Portal | Unchanged |
| — | Global Activity Log | New, §3.2 |
| — | Admin Console | New, §4.3 |

## 6. Definition of Done

- [ ] Extraction & Verification shows source image + source engine per field
- [ ] Compliance Score renders alongside, never instead of, Compliance
      Status, on all four pages that show status
- [ ] Report preview renders before export; PDF + one editable format both
      available
- [ ] Per-record History tab and the global Activity Log read from one
      shared `AuditEvent` shape
- [ ] Jurisdiction correctly scopes Dashboard/Records/Analytics/Scorecard
      visibility, without introducing a fourth role
- [ ] Admin Console's three tabs are reachable only by Admin, gated the
      same way existing Admin-only actions are gated elsewhere

## 7. Open questions to confirm with DoCA / Karan

- Compliance Score band labels/cutoffs (placeholders in §1.2)
- Whether District-level Enforcement Officers should ever see a shared
  district queue beyond their own assigned cases
- Second editable export format beyond .docx, if any
- Whether automatic upward escalation (vs. manual reassignment in §4.2)
  is wanted for a later phase
