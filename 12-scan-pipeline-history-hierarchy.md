# Addendum — Multi-Angle Capture Pipeline, Mobile Handoff, Processing Transparency, History & Hierarchical Management

> Companion to `Pages_Userflow/00-README.md`. Read that file first — this
> addendum does not repeat the Status Model, Violation Taxonomy, or Fixed
> Vocabulary; it extends them. Where this file adds a new enum value or
> field, it says so explicitly against the existing `src/types/*` files so
> nothing here silently forks the data model already in the repo.
>
> This addendum **supersedes the scope of `03-scan-upload.md`**. That file's
> sections 2–4 (single upload area, simple 5-state status) are replaced by
> the wizard in this file. Its Definition of Done items are absorbed into
> §11 below. Do not build `03-scan-upload.md` as originally written —
> build this instead.

---

## 0. Why this addendum exists

The original page list treated "scan a product" as one upload step feeding
a black-box OCR call. The PS's actual ask is broader: multi-angle capture
under field conditions, a device-flexible capture path (desktop *or*
handheld), a quality gate before spending OCR budget on unusable images,
a two-tier OCR strategy with a paid fallback, an LLM structuring step, and
a rule engine — each of which is a distinct state a demo judge should be
able to see happening, not a spinner that hides five backend calls. This
addendum also adds two things the original 11-page pack didn't cover at
all: a first-class history/audit trail, and hierarchical (jurisdiction-based)
management, since DoCA enforcement is organized as Central → State →
District, not as one flat pool of officers.

---

## 1. Revised end-to-end journey

```
Landing (public)
  → Login
    → Dashboard (role- and jurisdiction-scoped)
      → Scan Capture Wizard
          Step 0  Capture mode select (Desktop / Camera now / Continue on mobile)
          Step 1  Front image        ┐
          Step 2  Back image         ├─ each passes through the
          Step 3  Side / PDP image   ┘  Image Quality Inspection Layer
          Step 4  Metadata (+ optional manual entry, unchanged from before)
          Step 5  Submit
      → Processing Pipeline Tracker  (Quality → OCR → Fallback OCR →
                                       LLM Structuring → Rule Engine →
                                       Compliance Score)
      → Declaration Extraction & Verification (per-field, per-image,
                                                 per-engine transparency)
      → Compliance Records ⇄ Product Compliance Detail
      → Report Preview & Export (PDF + editable)
      → (all of the above write to) History & Audit Trail
```

Two entry points bypass the physical-capture wizard entirely and are
unchanged in relationship to it (per `00-README.md` §E): the **E-commerce
Listing Scanner** (page 8, no physical photo) and **Citizen Grievance
Portal** (page 11, a citizen's own upload, routed to an officer's queue
rather than an officer's own scan).

---

## 2. Scan Capture Wizard (replaces Page 3)

### 2.1 Step 0 — Capture mode select

Three cards, not a dropdown — this is the first decision and should be
visually prominent:

| Mode | When an officer picks it |
|---|---|
| **Upload from device** | Desktop/laptop with existing photos, or a phone being used directly as the browser device |
| **Use this device's camera** | Phone or tablet, browser has camera access, officer photographs live |
| **Continue on mobile** | Officer is at a desktop/laptop but the product is in front of them, not the computer — hand off capture to their phone |

"Continue on mobile" is the one genuinely new interaction. Selecting it
does **not** navigate away — it opens a panel in place showing:

- A QR code encoding a one-time, short-lived session URL (`/mobile-capture/{sessionToken}`)
- A plain-text fallback code below the QR (in case the officer needs to
  type it into a browser instead of scanning)
- Live status text: "Waiting for phone to connect…" → "Phone connected —
  waiting for photos…" → per-image confirmation as each one lands
- A visible countdown/expiry (session token TTL — 15 minutes suggested;
  DoCA to confirm) and a "Generate new code" action if it expires
- Cancel action, which invalidates the token immediately

**Session model:**
- `CaptureSession { id, token, scanDraftId, createdAt, expiresAt, status: "waiting" | "connected" | "capturing" | "completed" | "expired" | "cancelled", connectedDeviceLabel? }`
- Token is single-use and scoped to one `scanDraftId` — it cannot be
  reused for a second product once images are captured, preventing a
  stale QR from silently attaching photos to the wrong record.
- The desktop panel and the mobile page are two views of the same
  session state — desktop polls (or subscribes, if realtime infra exists)
  for status changes and renders each image thumbnail as it's uploaded by
  the phone, in the same three-slot layout described in §2.2.

### 2.2 Steps 1–3 — Front / Back / Side(PDP) capture

Three named slots, always visible together (not three separate full-screen
steps), so the officer can see at a glance what's still missing:

| Slot | What it must show | Why it's separate from the others |
|---|---|---|
| **Front** | The face customers see on shelf | Usually carries brand name, generic name, net quantity |
| **Back** | Ingredients/composition panel | Usually carries manufacturer details, consumer care |
| **Side — Principal Display Panel** | Whichever face actually carries the mandatory declaration cluster, when it differs from Front (common on cylindrical/irregular packs) | Rule 6 declarations must appear together on the *Principal Display Panel*; on many packs that's the front, but on bottles/tins it's frequently a wraparound or side panel — capturing it separately means the rule engine isn't guessing which face was "the label" |

Each slot, independent of the other two:
1. Starts empty with a placeholder icon + label ("Front", "Back", "Side — PDP")
2. Accepts an image via whichever Step-0 mode was chosen
3. Immediately (client-side first, then server-confirmed) runs through
   the **Image Quality Inspection Layer** — see §3 — before being marked
   filled
4. Shows a thumbnail once accepted, with Retake/Remove
5. Is independently retriable — rejecting the Back image never discards
   an already-accepted Front image

The wizard cannot advance to Step 4 until all three slots are filled and
passed. A fourth **optional** "Additional angle" slot may be added for
edge cases (e.g. a fourth panel with export-only declarations) but is not
required for submission.

### 2.3 Step 4 — Metadata & manual entry

Unchanged from the original `03-scan-upload.md` §2 Metadata and Manual
Entry sections: product category, manufacturer (autocomplete), region,
optional e-commerce listing URL (with the existing clarifying caption),
and the manual-entry fallback form. Carry these over as-is.

### 2.4 New type additions (`src/types/scan.ts`)

```ts
// Extends UploadedImage["angle"] — "front" | "back" | "side_pdp" | "other"
// (rename the existing "ingredients" to "back" conceptually, or keep both
//  if a product needs an ingredients panel distinct from a plain back —
//  confirm with Karan before renaming an existing shipped field)

export const CAPTURE_MODES = ["device_upload", "device_camera", "mobile_handoff"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export const CAPTURE_SESSION_STATUSES = [
  "waiting", "connected", "capturing", "completed", "expired", "cancelled",
] as const;
export type CaptureSessionStatus = (typeof CAPTURE_SESSION_STATUSES)[number];

export interface CaptureSession {
  id: string;
  token: string;
  scanDraftId: string;
  status: CaptureSessionStatus;
  connectedDeviceLabel?: string;
  createdAt: string;
  expiresAt: string;
}
```

---

## 3. Image Quality Inspection Layer

Runs on every individual image immediately after capture/upload, before
that slot is marked filled — this is a gate per image, not a gate on the
whole scan.

### 3.1 Checks

| Check | Rejects when |
|---|---|
| Blur | Sharpness score below threshold (motion blur, out of focus) |
| Distortion / skew | Perspective distortion severe enough that text geometry is unreliable |
| Curvature | Label wraps a curved surface badly enough that OCR would misread character shapes (common on bottles/jars) |
| Text visibility | No detectable text region at all, or coverage far below what a label should show (finger over lens, glare-out, wrong object entirely) |

### 3.2 UX

- Runs synchronously with a short "Checking image quality…" state — this
  should feel near-instant (client-side model or a fast server call), not
  a multi-second wait, since it gates each of three photos.
- On pass: thumbnail appears normally.
- On fail: the image is **rejected and deleted immediately** (server-side,
  not just hidden client-side — never retain an image that failed quality
  and won't be used, per data-minimization practice for a government
  system). The slot shows a specific reason ("Image is blurry — hold
  steady and retake" / "Label is too curved to read — try a flatter
  angle or more distance" / "No readable text detected") and a Retake
  action.
- A slot may be retried an unlimited number of times; nothing about a
  prior failed attempt is shown once a later attempt passes (the failure
  record still exists in the audit trail per §7, just not in the officer's
  active UI).

### 3.3 New vocabulary

```ts
export const IMAGE_QUALITY_STATUSES = ["checking", "passed", "failed"] as const;
export type ImageQualityStatus = (typeof IMAGE_QUALITY_STATUSES)[number];

export const IMAGE_QUALITY_FAILURE_REASONS = [
  "blurry", "distorted", "curved_unreadable", "no_text_detected",
] as const;
export type ImageQualityFailureReason = (typeof IMAGE_QUALITY_FAILURE_REASONS)[number];
```

---

## 4. Processing Pipeline Tracker (new page: `/scan/[id]/status`)

Once all three images pass quality and the officer submits, route here —
not straight into the extraction UI with everything already resolved.
This screen exists because the PS explicitly asks for OCR extraction, an
LLM structuring step, and a rule engine as distinguishable capabilities,
and because a five-stage backend process hidden behind one spinner is a
worse demo *and* a worse debugging surface than five visible stages.

### 4.1 Stages shown, in order

1. **Uploading** — images transferring (already covered by existing
   `UploadStatus`)
2. **Quality check** — per §3, should already be resolved before this
   screen, shown here as a completed step for continuity
3. **Text extraction (OCR)** — PaddleOCR runs on all three images.
   Per-field confidence coming out of this stage is what feeds
   `confidenceBand()` (already in `vocabulary.ts`)
4. **Fallback extraction** — shown **only when triggered**: any field
   whose PaddleOCR confidence fell below the configured threshold is
   re-run through the Gemini fallback path. If nothing needed fallback,
   this stage is skipped and shown as "Not needed — all fields extracted
   with high confidence" rather than silently omitted (an omitted step
   reads as broken, a skipped-and-labeled step reads as intentional)
5. **Structuring (LLM)** — raw OCR output from all three images is
   reconciled into one structured record matching `ExtractedDeclaration[]`
   — this is where redundancy across images gets resolved (e.g. MRP
   appearing on both Front and Side-PDP) and where each field gets
   attributed back to the image it was read from (see §5.1)
6. **Rule engine evaluation** — Rule 6/7/8 checks run against the
   structured record, producing the violation list and font-size checks
7. **Compliance score computed** — see §5.2
8. **Ready for verification** — terminal state, auto-navigates (or
   offers a "Review now" button) to Extraction & Verification

### 4.2 UX

- Vertical stepper, each stage: pending / in-progress (spinner) /
  completed (check) / failed (error, with retry scoped to just that
  stage where technically possible, e.g. re-running OCR without
  re-uploading images)
- Each completed stage shows a one-line result summary inline (e.g. "OCR
  complete — 6 of 7 fields ≥90% confidence", "Fallback used for 1 field:
  Country of Origin", "3 rule violations found")
- This is a genuinely good page for a judge demo — don't collapse it into
  a generic loading screen

### 4.3 New vocabulary

```ts
export const PIPELINE_STAGES = [
  "uploading", "quality_check", "ocr", "ocr_fallback",
  "llm_structuring", "rule_engine", "scoring", "ready",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_STATUSES = [
  "pending", "in_progress", "completed", "skipped", "failed",
] as const;
export type PipelineStageStatus = (typeof PIPELINE_STAGE_STATUSES)[number];

export interface PipelineStageState {
  stage: PipelineStage;
  status: PipelineStageStatus;
  summary?: string;
  startedAt?: string;
  completedAt?: string;
}

export const OCR_ENGINES = ["paddleocr", "gemini_fallback", "manual"] as const;
export type OcrEngine = (typeof OCR_ENGINES)[number];
```

`ExtractedDeclaration` (existing, in `scan.ts`) gains two fields:

```ts
export interface ExtractedDeclaration {
  // ...existing fields unchanged...
  sourceEngine: OcrEngine;          // which engine ultimately produced this value
  sourceImageAngle: "front" | "back" | "side_pdp"; // which photo it was read from
}
```

---

## 5. Extraction & Verification page — additions to Page 4

### 5.1 Per-field source transparency

Each declaration row already shows value / confidence band / corrected
flag. Add:
- A small badge showing which image it came from (Front / Back /
  Side-PDP), clicking it highlights or opens that thumbnail
- A small badge showing which engine produced it (PaddleOCR / Gemini
  fallback / Manual entry) — this is a trust feature for enforcement
  officers who will want to know when they're looking at a
  second-opinion read rather than the primary pipeline's own confidence

Nothing about the existing Confirm & Verify / Flag as Needs Review
actions, or the Verification Status model, changes.

### 5.2 Compliance Score (new, additive — does not replace Compliance Status)

The existing four-value `ComplianceStatus` stays exactly as defined in
`00-README.md` §A — this is not a replacement, it's a second, numeric
signal shown alongside it once Verification Status is `Verified`.

- **Definition:** 0–100, computed from the proportion of applicable
  mandatory fields that passed, weighted so a missing mandatory
  declaration counts for more than a font-size shortfall (exact weights
  are a backend/rule-engine decision — the frontend just renders whatever
  number and per-category breakdown the API returns; do not hardcode a
  formula in the frontend).
- **Display:** a numeric score + a short qualitative band for scanning
  (e.g. 90–100 "Excellent", 70–89 "Good", 40–69 "Poor", <40 "Critical" —
  confirm exact bands and labels with Karan/DoCA before shipping; these
  are placeholders, not confirmed vocabulary like the four-value status)
  is shown on Product Compliance Detail, Compliance Records (as a
  sortable column), Analytics, and Manufacturer Scorecard — the same four
  places the existing Compliance Status appears.
- **Relationship to Compliance Status:** Compliance Status is the
  governing field for filtering/workflow (Pending/Compliant/
  Non-Compliant/Needs Review). Compliance Score is a finer-grained
  severity signal *within* Compliant or Non-Compliant — e.g. two
  Non-Compliant products can have very different scores (one missing
  everything, one failing only a font-size check), and that distinction
  matters for prioritizing enforcement action.

```ts
export interface ComplianceScore {
  value: number;              // 0-100
  band: "Excellent" | "Good" | "Poor" | "Critical"; // placeholder wording, confirm before ship
  breakdownByCategory: Partial<Record<ViolationCategoryId, number>>; // point impact per category, for a tooltip/chart
}
```

---

## 6. Report Preview & Export — addition to Page 10 (Reports & Profile)

Before a report is exported, add a preview step:
- Rendered preview of the PDF layout in-browser (not just a "Download"
  button firing blind)
- Editable-format export alongside PDF (the PS explicitly asks for
  "editable formats" — .docx is the safe default; confirm with Karan
  whether a second format is also wanted)
- Officer attribution block on the report: name, role, region, and the
  date verification was completed — pulled from the record's audit trail
  (§7), not re-entered
- A verification reference code or QR on the PDF itself, so a printed
  report can be checked against the system later (useful for legal/audit
  defensibility of an enforcement action) — flag this as a stretch item
  if backend support isn't ready yet, don't block the base export flow on
  it

---

## 7. History & Audit Trail (new)

Two surfaces, same underlying data:

### 7.1 Per-record timeline (embedded on Product Compliance Detail, as a tab: "History")

A vertical timeline of every event on that specific record, oldest first
or newest first (pick one and keep it consistent app-wide):

- Scan created (by whom, mode used, source tag)
- Each image quality check attempt — including failed ones, with the
  reason (this is where a rejected/deleted image's failure is preserved
  even though the image itself is gone)
- OCR started/completed, per stage from §4.1, with which engine handled
  which fields
- Every correction made during verification — old value → new value,
  which field, which user, timestamp (the existing `corrected` /
  `correctedByUserId` fields on `ExtractedDeclaration` feed this, but the
  timeline needs the actual history, not just a boolean — see §7.3)
- Confirm & Verify performed
- Flag as Needs Review applied (and by whom, and any note attached)
- Report generated / exported / downloaded, and by whom
- Archived (Admin only), if applicable

### 7.2 Global Activity Log (new page, Admin + Reviewer)

A filterable, searchable feed across *all* records — by user, by action
type, by date range, by region/jurisdiction. This is the accountability
surface: "show me everything Officer X did last week," "show me every
Flag as Needs Review in Maharashtra this month." Reviewer's read-only,
oversight-oriented role (per the existing Role Permission Matrix) makes
this page a natural fit for that role specifically, alongside Analytics
and Manufacturer Scorecard which Reviewer already has access to.

### 7.3 New type (`src/types/history.ts` — new file)

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
  recordId: string; // scanId or complianceRecordId
  type: AuditEventType;
  actorUserId?: string;   // absent for system-generated events (e.g. ocr_completed)
  actorRole?: Role;
  detail?: string;        // human-readable one-liner for the timeline
  fieldId?: string;       // present for field_corrected
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}
```

---

## 8. Hierarchical Management

DoCA enforcement runs Central → State → District, and the existing
three-role model (Enforcement Officer / Admin / Reviewer) is a
**permission** dimension, not an **organizational** one. Add jurisdiction
as a second, orthogonal dimension rather than multiplying roles — this
keeps the existing Role Permission Matrix in `00-README.md` §C valid
as-is; nothing there needs to change.

### 8.1 Model

```ts
export const JURISDICTION_LEVELS = ["National", "State", "District"] as const;
export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

export interface Jurisdiction {
  id: string;
  level: JurisdictionLevel;
  name: string;              // e.g. "Maharashtra", "Pune"
  parentJurisdictionId?: string; // District → State → National
}
```

`User` (existing, in `src/types/user.ts`) gains:

```ts
export interface User {
  // ...existing fields unchanged...
  jurisdictionId: string;      // the jurisdiction this user is scoped to
  reportsToUserId?: string;    // direct organizational manager, if any
}
```

### 8.2 What jurisdiction changes, concretely

- **Data visibility scopes automatically by jurisdiction, not just role.**
  A District-level Admin sees only their district's records on Dashboard,
  Compliance Records, Analytics, and Manufacturer Scorecard. A State-level
  Admin sees their state (all districts under it, individually
  filterable). A National-level Admin sees everything. Enforcement
  Officers always see their own cases regardless of jurisdiction level of
  their account (unchanged from today) plus, if their Admin has granted
  it, their district's shared queue.
- **Case assignment/reassignment.** An Admin at or above a case's
  jurisdiction can reassign a case from one Enforcement Officer to
  another within their scope — needed for workload balancing and for
  reassigning cases when an officer is unavailable. This produces a
  `case_reassigned` audit event (§7.3).
- **Escalation path.** "Flag as Needs Review" (existing action, unchanged
  in what it does) becomes organizationally meaningful: a District Admin
  can see it needs a State-level decision and re-flag it upward — this is
  a manual action (assign to a specific higher-jurisdiction Admin), not
  automatic routing, since automatic escalation rules are a stretch
  feature to design later, not part of this addendum.
- **Roll-up dashboards.** Dashboard KPIs (Products Scanned, Compliant,
  Non-Compliant, Pending) get an optional jurisdiction breakdown view for
  State/National Admins — a table or map-free breakdown by
  sub-jurisdiction (no GIS map, per the existing locked scope decision to
  exclude mapping from MVP), sortable by non-compliance rate, to spot
  which districts need attention.

### 8.3 New page — Admin Console (Admin only)

Consolidates jurisdiction and system-configuration concerns into one
page with tabs, rather than three separate pages, to keep the page count
manageable:

- **Tab: Team & Jurisdiction** — org list of users within the current
  Admin's jurisdiction (and sub-jurisdictions), each row: name, role,
  jurisdiction, case load (open records assigned), last active. Actions:
  reassign a user's jurisdiction, reassign cases between officers,
  deactivate a user (Admin action only, per existing matrix's Archive/
  Admin-only pattern).
- **Tab: Rule Thresholds** — the existing matrix's stretch item "Manage
  rule thresholds" — OCR confidence threshold that triggers Gemini
  fallback, font-size tolerance if any, compliance score band cutoffs.
  Changes here are themselves audit-logged (`AuditEventType` may need one
  more value, `rule_threshold_changed`, if this ships before MVP; fine to
  add later otherwise).
- **Tab: System** — active locales, max upload size (already a
  documented placeholder in `scan.ts`), other environment-level settings
  currently hardcoded via env vars that DoCA may eventually want
  self-service control over. Lower priority than the other two tabs —
  build last if time is short.

---

## 9. Full page list after this addendum

| # | Page | Status |
|---|---|---|
| — | Landing | **Built** |
| 1 | Login | Stub — build next |
| 2 | Dashboard (+ shell) | Stub — build next |
| 3 | Scan Capture Wizard | **Replaces old Page 3** — build per §2 |
| — | Mobile Capture Companion (`/mobile-capture/[token]`, no sidebar shell) | New — build alongside §3 |
| — | Processing Pipeline Tracker (`/scan/[id]/status`) | New — §4 |
| 4 | Declaration Extraction & Verification | Stub — build with §5 additions |
| 5 | Compliance Records | Stub — build with Compliance Score column |
| 6 | Product Compliance Detail | Stub — build with History tab (§7.1) |
| 7 | Analytics & Violation Trends | Stub — build with jurisdiction breakdown |
| 8 | E-commerce Listing Scanner | Stub — unchanged scope |
| 9 | Manufacturer Compliance Scorecard | Stub — unchanged scope |
| 10 | Reports & Profile | Stub — build with §6 preview/export |
| 11 | Citizen Grievance Portal | Stub — unchanged scope |
| — | Global Activity Log | New — §7.2 |
| — | Admin Console (Team/Jurisdiction, Rule Thresholds, System) | New — §8.3 |

Recommended build order from here: **Login → Dashboard shell → Scan
Capture Wizard + Mobile Capture Companion → Processing Pipeline Tracker →
Extraction & Verification → Compliance Records → Product Compliance
Detail → Analytics → E-commerce Scanner → Manufacturer Scorecard →
Reports & Profile → Citizen Grievance Portal → Admin Console → Global
Activity Log.** This keeps the pipeline's core demo path (login through a
verified, scored report) working end-to-end before the two purely
administrative pages, which don't block that demo.

---

## 10. Definition of Done for this addendum

- [ ] Capture mode select offers exactly three options, each functional
      (device upload, device camera, mobile handoff)
- [ ] Mobile handoff QR session is single-use, time-limited, and scoped
      to one scan draft
- [ ] Front/Back/Side-PDP are three independently-fillable, independently-
      retriable slots
- [ ] Every image passes through the quality gate before being accepted;
      rejected images are deleted, not merely hidden
- [ ] Quality failure reasons are specific (not a generic "upload failed")
- [ ] Processing Pipeline Tracker shows all 8 stages, with fallback OCR
      explicitly marked "not needed" when skipped rather than omitted
- [ ] Extraction & Verification shows source image + source engine per
      field
- [ ] Compliance Score renders alongside, never instead of, Compliance
      Status, on all four existing pages that show status
- [ ] Per-record History tab and the global Activity Log both read from
      one shared `AuditEvent` shape
- [ ] Jurisdiction correctly scopes Dashboard/Records/Analytics/Scorecard
      visibility per §8.2, without introducing a fourth role
- [ ] Admin Console's three tabs are reachable only by Admin, gated the
      same way existing Admin-only actions are gated elsewhere in the app

---

## 11. Open questions to confirm with DoCA / Karan before finalizing details

- Mobile-handoff session TTL (15 minutes suggested here, unconfirmed)
- Compliance Score band labels/cutoffs (placeholders in §5.2)
- Whether District-level Enforcement Officers should ever see a shared
  district queue beyond their own assigned cases, or strictly own-cases-only
- Second editable export format beyond .docx, if any
- Whether automatic upward escalation (vs. the manual reassignment
  described in §8.2) is wanted for a later phase
