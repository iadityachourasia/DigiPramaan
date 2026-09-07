# Digi-Pramaan — Backend Handoff

**Project:** Digi-Pramaan (SIH26034) — Legal Metrology Compliance System
**Owner department (fictional deployment target):** Department of Consumer Affairs, Ministry of Consumer Affairs, Food & Public Distribution, Government of India
**Repository state at time of writing:** branch `master`, HEAD `ee639f4` ("Build the Global Activity Log (13 §3.2)")
**Stack:** Next.js 16.3.4 (App Router, Turbopack), React 19.2.8, TypeScript 5.9.3 in `strict` mode with `exactOptionalPropertyTypes: true`, next-intl 4.14.2, UX4G Design System v3 (`ux4g-web-components@2.0.1`)

---

## How to read this document

This is a frontend-complete, backend-absent application. Every screen works, every
state is reachable, and every workflow can be walked end to end — but nothing is
persisted beyond a server process lifetime and none of the intelligent processing
(OCR, LLM structuring, rule evaluation) is real. The frontend was built to a
deliberate discipline: where something is faked, the code says so in a comment
rather than hiding it. This document collects those admissions in one place.

**Assumptions stated up front, because nothing in the repo settles them:**

1. **The Admin Console and the Jurisdiction model were never built.** Spec section
   13 §4 describes them. No `Jurisdiction` type exists, no `jurisdictionId` field
   exists on any type, and there is no admin route. Section 7 records what was
   actually decided instead.
2. **"Backend" here means a real server-side application.** The Next.js Route
   Handlers under `src/app/api/` are real HTTP endpoints, but they are backed by
   in-memory JavaScript `Map`s in the same process. Whether the real backend
   replaces those handlers or sits behind them is a decision left open; section 11
   gives a recommendation.
3. **The frontend's client-side API layer is already split** into a mock branch and
   a real `fetch` branch, gated by `isMockMode()`. Where a surface is
   server-authoritative, that gate was deliberately removed. This matters for
   integration and is documented per endpoint.
4. **No spec file defines the wire format for a real backend.** Everything in
   section 3 is the contract the frontend already speaks to its own Route Handlers.
   Preserving those shapes is the cheapest path to integration.

---

# 1. Page-by-page status

The Role Permission Matrix lives in two places that must agree: `Pages_Userflow/00-README.md`
§C (the spec) and `ROLE_PERMISSIONS` in `src/types/user.ts` (the code). A unit test
asserts the code side.

There are three roles and only three: **Enforcement Officer**, **Admin**, **Reviewer**.

## The access-control distinction, stated once

Two independent mechanisms exist, and the difference matters enormously for backend work:

- **Navigation hiding** — `SIDEBAR_NAV` in `src/lib/constants/routes.ts` gives each
  entry an optional `permission`. An entry whose permission the current role lacks
  is not rendered. This hides the link. It does not protect the route.
- **Page-level enforcement** — the page's own view component calls `usePermission()`
  and renders a refusal state instead of the page body. This stops a user who types
  the URL directly.
- **Neither is a security boundary.** `RequireAuth` (`src/components/shared/RequireAuth.tsx`)
  states this in its own doc comment: the session lives in `sessionStorage`, which
  middleware cannot read, so `src/proxy.ts` stays locale-only. **No Route Handler in
  this application performs any server-side session or role check.** Every mutation
  endpoint accepts an unvalidated `userId` in its request body and trusts it. A
  `curl` against any endpoint succeeds regardless of who you are.

The Global Activity Log shipped initially with nav hiding only. That gap was caught
during its own live verification and fixed in `ee639f4`. It is called out below
because the same class of gap may exist elsewhere and the backend must not assume
the frontend gates anything.

## The 13 pages

### 1. Login — `/login`

**Status:** Built. **Access:** Public (unauthenticated). **Enforcement:** N/A.

The single unauthenticated entry point for staff. Accepts a username or an email
plus a password, and renders seven distinct states: submit gated until both fields
have content, invalid username format reported on that field, wrong password
reported generically while clearing only the password field, service-unreachable as
its own message distinct from bad credentials, an expired-session notice that reads
as information rather than failure, a password reveal toggle meeting the 44px touch
target, and successful sign-in landing on the Dashboard. A `?next=` parameter
carries a deep link through the round trip. **Role is never selected in the UI** —
it arrives from the backend with the session, which is the resolution recorded
against BRD §15 Q-01. Authentication is entirely mocked; see section 4.

### 2. Dashboard — `/dashboard`

**Status:** Built. **Access:** All three roles. **Enforcement:** Authentication only
(`RequireAuth`); no permission gate, correctly, since all roles may view it.

The first authenticated page and the one that establishes the shared sidebar/header
shell. Four KPI cards (products scanned, compliant, non-compliant, pending) each
carrying a signed delta with a text label rather than a colour or arrow alone, a
compliance trend chart with a weekly/monthly toggle, a Recent Scans table capped at
eight rows each linking to its record, and an alerts panel whose severity maps to a
real status token rather than defaulting everything to error. Quick actions are
role-gated: a Reviewer sees neither scan-creating action, which is enforced through
`usePermission("scan.create")` inside `QuickActions`. Every widget has independent
loading, error and empty states so one failing widget does not blank the page.

### 3. Scan / Upload Product — `/scan`

**Status:** Built. **Access:** Enforcement Officer, Admin. **Enforcement:** Both. Nav
hides it via `permission: "scan.create"`, and `ScanWizard` re-checks
`usePermission("scan.create")` and renders a refusal `EmptyState` for a Reviewer who
types the URL.

The primary intake path. Three capture modes (upload from device, this device's
camera, continue on mobile) feeding four capture slots — Front, Back, Side/Principal
Display Panel required, plus an optional fourth. Each submitted photo passes through
the Image Quality Inspection Layer before it becomes part of the scan; a failed
attempt leaves no trace once a later attempt passes. A manual-entry path exists for
when photography is impossible. Metadata (category, manufacturer, region, optional
e-commerce listing URL) is collected before submission. **This page's quality gate
is the single most important mock in the product to replace** — see section 4.

### 3a. Processing Pipeline Tracker — `/scan/[scanId]/status`

**Status:** Built. **Access:** Same as `/scan`. **Enforcement:** Authentication only;
reachable by anyone signed in who knows a scan id.

Eight ordered stages with five possible states each. `skipped` is a first-class
state so fallback extraction can be shown as explicitly not needed rather than
silently omitted. Failures are stage-scoped: a specific reason and a retry that does
not restart completed stages. Progress is polled; see section 6.

### 3b. Mobile Capture Companion — `/scan/mobile/[token]`

**Status:** Built. **Access:** Anyone holding a valid, unexpired, unused token.
**Enforcement:** Token validity only — deliberately, because the phone is a different
browser context with no session.

A shell-less route the officer's phone reaches by scanning a QR code shown on the
desktop. Captures the same slots, runs the same client-side quality check, and posts
each passed angle back to the shared session. The desktop tab mirrors captures live.

### 4. Declaration Extraction & Verification — `/extraction/[recordId]`

**Status:** Built. **Access:** Enforcement Officer, Admin can verify; all roles can
view and flag. **Enforcement:** Action-level, not page-level. `ExtractionView` gates
the Confirm & Verify control on `usePermission("verification.confirm")` and the flag
control on `record.flagNeedsReview`. **The page itself is reachable by a Reviewer**,
which is correct — they can review the extraction, they just cannot confirm it.

A two-panel layout: captured images on one side, the seven mandatory declarations on
the other. Each declaration carries a value, a confidence percentage with its derived
band, a source engine badge (PaddleOCR, Gemini fallback, or manual) and a source
image angle. Three visually distinct signals that must not be conflated: *not
detected* (nothing found), *low confidence* (something found, system unsure), and
*corrected* (a human changed it). The Rule 7 numeral-height check is kept structurally
separate from the general confidence score because it is the PS-specific check a
judge will look for. Inline corrections write to the record and the audit log. Confirm
& Verify is blocked — with a 200 response naming the blocking fields, not an error —
while any declaration is still `notDetected`. Retry OCR and a manual-entry fallback
cover total extraction failure.

### 5. Compliance Records — `/records`

**Status:** Built. **Access:** All three roles. **Enforcement:** Authentication only
for the page; individual actions gated (`record.archive`, `record.bulkStatusChange`
are Admin-only and checked in `RecordsView`).

The list surface. Eight filter dimensions (free-text search, category, compliance
status, region, manufacturer, source, violation category, date range) plus five sort
options, all carried in the URL as repeated query keys so a filtered view is a
shareable link. Server-side pagination. Per-row actions are View, Re-scan, Generate
Report, and — for an Admin — Archive. A bulk Needs Review flag/clear is available to
Admin. A "Generate report from these filters" action hands the current filter set to
the Report Builder as a scope.

### 6. Product Compliance Detail — `/records/[recordId]`

**Status:** Built. **Access:** All three roles. **Enforcement:** Action-level.
`RecordDetailView` gates on `record.flagNeedsReview` and `record.flagForEnforcement`.

The full read of one record: the declaration checklist with per-line pass/fail and a
citable detail ("MRP numeral height 3 mm, below the required 4 mm minimum" rather
than a bare "non-compliant"), the violation summary using verbatim taxonomy wording
and legal basis, the source images with per-angle switching, attached evidence, and
the audit trail timeline. **The timeline shows the coarse seven-value projection**,
not the full seventeen-type activity vocabulary — pipeline stages, archiving,
cleared flags and re-extraction are logged but deliberately not rendered here. See
section 8 on the audit store.

### 7. Analytics & Violation Trends — `/analytics`

**Status:** Built. **Access:** All three roles (`analytics.view` is granted to all).
**Enforcement:** Nav gate only, which is harmless because every role holds the
permission.

Summary metrics (total scanned, compliance rate, processing success rate), a trend
line, and four breakdowns: by violation category, by product category, by region and
by source. Anomaly alerts deep-link into filtered Records views. Every chart has an
`ux4g-sr-only` table equivalent for screen readers, wrapped in a `div` rather than
exposed as a bare table because a table ignores `width: 1px` and caused horizontal
overflow at 375px.

### 8. E-commerce Listing Scanner (USP) — `/ecommerce`, `/ecommerce/batch/[batchId]`

**Status:** Built. **Access:** Enforcement Officer, Admin. **Enforcement:** Both. Nav
gates on `scan.create`; `EcommerceView` re-checks `usePermission("scan.create")`.

Two modes. Single mode fetches one product listing, previews it, and hands it to the
same pipeline page 3 uses — tagged `E-commerce-Sourced` — landing on the same
tracker. Bulk mode fetches the listings on a category or search-results page, lets
the officer select a subset, and starts one independent pipeline run per selection.
Per-listing status is derived from each run on every read rather than stored, so
partial failure is structurally impossible to misreport. Completed batches are
filterable in Compliance Records by `batchId`. Scraping is entirely mocked; see
section 4.

### 9. Manufacturer Compliance Scorecard (USP) — `/manufacturers`, `/manufacturers/[id]`

**Status:** Built. **Access:** All three roles for viewing; flag-for-enforcement is
Enforcement Officer and Admin. **Enforcement:** Nav gates on `analytics.view` (all
roles hold it); `ScorecardView` gates the enforcement action on
`record.flagForEnforcement`.

Aggregates every record by manufacturer: total scanned, compliance rate, first and
last scan dates, a compliance trend, and a violation breakdown reusing the same ten
categories. A repeat-violation flag is raised on a documented heuristic (three or
more non-compliant records within 90 days), and the UI is explicit that it is a
heuristic rather than a model. **There is deliberately no inverse "clear" badge** —
09 §4 warns it could be mistaken for an official certification this system does not
issue. Manufacturer name matching is exact string matching; two spellings of one
company are two manufacturers, and the UI says so.

### 10. Reports & Profile — `/reports`, `/profile`

**Status:** Built. **Access:** All three roles (`report.generate` is granted to all).
**Enforcement:** Nav gate only, harmless as above.

A report builder that accepts three scope kinds (a single record, a manufacturer, or
a filter set carried over from Compliance Records), a format selection of PDF and/or
DOCX, a pre-generation scope check that reports the row count and warns above 100
rows, a three-stage generation run with stage-scoped retry, an in-browser preview
built from the same document structure the files render from, and a download history
whose entries re-download indefinitely. **This is the one feature in the app that is
genuinely production-real** — see section 8. Profile shows account details and
notification settings; the password-change control is deliberately disabled rather
than faked, because there is no credential store to change anything in.

### 11. Citizen Grievance Portal (USP) — `/grievance`

**Status:** Built. **Access:** Fully public, no authentication. **Enforcement:** None
by design; this is the only endpoint in the product that is *meant* to be open.

A shell-less public page. One required field — a photograph — and everything else
optional, deliberately, because requiring contact details would suppress
submissions. Plain-language concern checkboxes rather than the taxonomy. A real
client-side photo quality check that produces a gentle suggestion and never blocks
submission. On submit the citizen receives a short tracking reference they can look
up later, which returns a coarse three-value public status (Received, Under Review,
Resolved) and nothing else — never the internal Compliance Status, never an officer
name, never a rule citation. Submissions become `Citizen-Reported` compliance
records visible to officers. Abuse guards are demo-grade and labelled as such.

### 12. Global Activity Log — `/activity`

**Status:** Built (`ee639f4`). **Access:** Admin and Reviewer only. **Enforcement:**
Both, but only after a fix.

The cross-record accountability surface: every action taken on any record, by whom
and when, filterable by person, action type, region and date range, all in the URL.
Seventeen event types, including seven that appear nowhere else in the product. Its
permission, `activity.view`, was added specifically for it because
Admin-plus-Reviewer-without-Enforcement-Officer is a shape that exists nowhere else
in the matrix.

**Flagged as instructed:** this page shipped its first implementation with nav
hiding only. An Enforcement Officer who typed `/activity` saw the complete log.
Caught during live verification, fixed by adding a `usePermission("activity.view")`
check in `ActivityView` that renders a refusal in place rather than redirecting. The
in-place refusal matches how the scan wizard refuses a Reviewer; a redirect would
bounce someone who followed a colleague's link without saying why.

### 13. Admin Console — **NOT BUILT**

**Status:** Not started. No route, no components, no types. **Intended access:**
Admin only, per 13 §4.

Spec 13 §4 describes user and jurisdiction management, case reassignment, and rule
threshold administration. None of it exists. Three concrete consequences that the
backend inherits:

- **`case_reassigned` is a declared activity event type that is never emitted.** It
  appears in the Activity Log's action filter and always returns nothing, which
  reads as broken. It was kept so the vocabulary matches the spec rather than
  quietly diverging.
- **`rules.manageThresholds` is a declared permission with no UI behind it.** The
  repeat-violation threshold is a frozen constant; see section 7.
- **The Jurisdiction model does not exist.** See section 7 for what was decided
  instead.

### Also not built: statutory footer pages

`/accessibility`, `/privacy`, `/terms`, `/rti` and `/help` are declared in `ROUTES`
and linked from the footer, as required of every Government of India site by BRD §9.4
and GIGW 3.0. **The pages themselves do not exist.** The links 404.

---

# 2. Complete data model

Every type lives under `src/types/` and is re-exported through `src/types/index.ts`
with `export *`. Import from `@/types`, never from an individual file. **Because the
barrel uses `export *`, no two modules may export the same name** — this is why the
central activity event is called `ActivityEvent` rather than the spec's `AuditEvent`,
which was already taken.

## 2.1 `vocabulary.ts` — the fixed vocabulary

These strings must appear verbatim on every screen. They are the terminology
contract, and the backend should treat them as enumerated values, not free text.

| Constant | Values |
|---|---|
| `VERIFICATION_STATUSES` | `Extracted`, `Verified` |
| `COMPLIANCE_STATUSES` | `Pending`, `Compliant`, `Non-Compliant`, `Needs Review` |
| `SOURCE_TAGS` | `Officer-Scanned`, `Citizen-Reported`, `E-commerce-Sourced` |
| `ROLES` | `Enforcement Officer`, `Admin`, `Reviewer` |
| `PROCESSING_STATUSES` | `Queued`, `Processing`, `Completed`, `Failed` |
| `UPLOAD_STATUSES` | `Queued`, `Uploading`, `Processing`, `Completed`, `Failed` |
| `PUBLIC_GRIEVANCE_STATUSES` | `Received`, `Under Review`, `Resolved` |
| `CONFIDENCE_BANDS` | `High`, `Medium`, `Low` |

**Status model semantics, which the backend must preserve:**

- **Verification Status** is internal workflow state, surfaced only on pages 4 and 6.
- **Compliance Status** is what everything else shows. `Pending` means "compliance
  has not yet been determined", never "processing is slow".
- **`Needs Review` is a human override and always wins.** It is never computed.
- `computeComplianceStatus()` in `compliance.ts` is the one implementation:
  needs-review flag wins; an unverified record is `Pending` regardless of checklist
  contents; otherwise any failed checklist line makes it `Non-Compliant`.

**Confidence bands** derive from a raw percentage: High ≥ 90, Medium 70–89, Low < 70
(`confidenceBand()`).

**The Canonical Violation Taxonomy** — ten categories, used identically by the
per-field checklist, the violation summary, the analytics breakdown and the
manufacturer scorecard:

| id | Category (verbatim) | Legal basis |
|---|---|---|
| `manufacturer-details-missing` | Manufacturer/Packer/Importer Details Missing | Rule 6(a) |
| `generic-name-missing-or-incorrect` | Generic Name Missing or Incorrect | Rule 6(b) |
| `net-quantity-missing-or-incorrect` | Net Quantity Missing or Incorrect | Rule 6(c) |
| `manufacture-import-date-missing` | Manufacture/Import Date Missing | Rule 6(d) |
| `mrp-non-compliance` | MRP Non-Compliance | Rule 6(e) |
| `country-of-origin-missing` | Country of Origin Missing | Rule 6 (imports only) |
| `consumer-care-details-missing` | Consumer Care Details Missing | Rule 6 |
| `font-size-readability-failure` | Font Size / Readability Failure | Rule 7 |
| `non-standard-or-misleading-format` | Non-Standard or Misleading Format | Rule 8/9 |
| `other` | Other | — |

Each definition also carries a `shortLabel` used **only** for chart axis labels;
legends, tooltips and written summaries must use the full `category` string.

## 2.2 `user.ts`

### `User`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `id` | `string` | no | Backend at authentication. Mock ids are `usr-001`, `usr-002`, `usr-003`. |
| `username` | `string` | no | Login identifier; a username or an email is accepted. |
| `fullName` | `string` | no | Directory. Rendered throughout the audit trail and activity log. |
| `email` | `string` | no | Directory. |
| `role` | `Role` | no | **Assigned server-side from credentials. Never chosen in the UI.** |
| `department` | `string` | no | Directory. Shown on the profile page. |
| `region` | `string` | no | The officer's posting. Defaults the Scan/Upload metadata region. |
| `lastLoginAt` | `string` (ISO 8601) | no | Backend at authentication. |

### `Session`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `user` | `User` | no | Login response. |
| `token` | `string` | no | Opaque; never rendered. Mock value is the literal `mock-session-<userId>`. |
| `expiresAt` | `string` (ISO 8601) | no | Login response. Drives the pre-expiry warning that is **not yet implemented**. |

### `Permission` and `ROLE_PERMISSIONS`

Ten permissions: `scan.create`, `verification.confirm`, `record.flagNeedsReview`,
`record.flagForEnforcement`, `record.archive`, `record.bulkStatusChange`,
`analytics.view`, `rules.manageThresholds`, `report.generate`, `activity.view`.

| Role | Permissions |
|---|---|
| Enforcement Officer | `scan.create`, `verification.confirm`, `record.flagNeedsReview`, `record.flagForEnforcement`, `analytics.view`, `report.generate` |
| Admin | all ten |
| Reviewer | `record.flagNeedsReview`, `analytics.view`, `report.generate`, `activity.view` |

`can(role, permission)` is the one lookup.

**Not wired to any UI:** `rules.manageThresholds` (no Admin Console).

## 2.3 `scan.ts`

### `UploadedImage`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `id` | `string` | no | Synthesized, e.g. `${recordId}-img-${angle}`. |
| `fileName` | `string` | no | The original file name, or a synthesized placeholder name. |
| `url` | `string` | no | **See section 5.** A blob object URL, a data URL, or a static placeholder path depending on the intake path. Never real object storage. |
| `sizeBytes` | `number` | no | From the `File`, or `0` for a placeholder. |
| `angle` | `"front" \| "back" \| "side_pdp" \| "additional" \| "other"` | no | The capture slot. `"other"` is a separate concept used only for free-form evidence attachments, never for a named slot. |
| `altText` | `string` | no | Mandatory and never empty for evidence images (accessibility requirement A-02). Currently synthesized from the angle. |

### `QualityCheckResult`

| Field | Type | Optional |
|---|---|---|
| `passed` | `boolean` | no |
| `failureReason` | `QualityFailureReason` | yes — present only when `passed` is false |

`QUALITY_FAILURE_REASONS`: `blur`, `distortion`, `curvature`, `no_text_detected`.

### `CaptureSlotState` (client-only; never persisted)

`angle`, `status` (`empty` / `capturing` / `checking` / `passed` / `failed`),
optional `image`, optional `failureReason`. **Deliberately not part of `Scan`** — a
slot becomes part of the real scan only once it passes the gate, and a failed
attempt leaves no trace.

### `MobileHandoffSession`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `token` | `string` | no | `generateHandoffCode()` — an unambiguous short code. |
| `scanDraftId` | `string` | no | Scopes the session to one in-progress scan draft. |
| `status` | `waiting \| connected \| expired \| cancelled` | no | Derived: expiry is computed from `expiresAt` on every read, not by a timer. |
| `createdAt` | `string` (ISO 8601) | no | Creation. |
| `expiresAt` | `string` (ISO 8601) | no | Creation + 5 minutes. |
| `capturedAngles` | `CaptureSlotAngle[]` | no | Grows as the phone captures each angle. |
| `capturedImages` | `Partial<Record<CaptureSlotAngle, UploadedImage>>` | no | **Each `url` is a base64 data URL.** No object storage exists. |

### `PipelineStage` / `PipelineRun`

`PIPELINE_STAGE_IDS` in order: `uploading`, `qualityCheck`, `textExtraction`,
`fallbackExtraction`, `structuring`, `ruleEngine`, `complianceScore`,
`readyForVerification`.

`PIPELINE_STAGE_STATES`: `pending`, `in_progress`, `completed`, `skipped`, `failed`.
Five, not four — `skipped` exists so fallback extraction can be shown as explicitly
not needed rather than silently omitted.

`PipelineStage` = `{ id, state, summary?, failureReason? }`.
`PipelineRun` = `{ scanId, recordId, stages }`. `recordId` is stable from creation
even before the record exists, so the tracker can link to it once ready.

### `ScanMetadata`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `category` | `ProductCategory` | no | Wizard form, or synthesized as `"Other"` for citizen submissions. |
| `manufacturerName` | `string` | yes | Wizard autocomplete, or the scraped listing. |
| `region` | `string` | no | Wizard, defaulted from the officer's posting. **Citizen submissions get the sentinel `"Not specified"`.** |
| `productName` | `string` | yes | **Only the e-commerce path supplies this.** See the placeholder note below. |
| `ecommerceListingUrl` | `string` | yes | Set by both intake paths, distinguished by the record's `source`. |

`PRODUCT_CATEGORIES`: Packaged Food, Beverages, Personal Care, Household Cleaning,
Pharmaceuticals, Textiles and Garments, Electronics and Appliances, Other.

### `ExtractedDeclaration`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `fieldId` | `DeclarationFieldId` | no | One of the seven mandatory declarations. |
| `value` | `string \| null` | no | Null when the pipeline found nothing. **Currently a fixture value from `SAMPLE_VALUES`.** |
| `notDetected` | `boolean` | no | Distinct from low confidence and must look different in the UI. |
| `confidence` | `number` (0–100) | no | **Currently synthesized**: `92 + (index % 6)`, or `82` for the seeded fallback field, or `0` when all-missing. |
| `band` | `ConfidenceBand` | no | Derived from `confidence`. |
| `corrected` | `boolean` | no | Set by an inline correction. |
| `correctedByUserId` | `string` | yes | Set with `corrected`. |
| `sourceEngine` | `"paddleocr" \| "gemini_fallback" \| "manual"` | no | **Currently synthesized** — `gemini_fallback` only for the one seeded fallback field. |
| `sourceImageAngle` | `"front" \| "back" \| "side_pdp"` | no | **Currently a static per-field map**, `DECLARATION_FIELD_SOURCE_ANGLE`, not a real detection result. |

`DECLARATION_FIELD_IDS`, with the taxonomy category each maps to on failure and its
legal basis (`DECLARATION_FIELDS`):

| Field id | Fails as | Legal basis | Imports only |
|---|---|---|---|
| `manufacturerDetails` | `manufacturer-details-missing` | Rule 6(a) | no |
| `genericName` | `generic-name-missing-or-incorrect` | Rule 6(b) | no |
| `netQuantity` | `net-quantity-missing-or-incorrect` | Rule 6(c) | no |
| `manufactureDate` | `manufacture-import-date-missing` | Rule 6(d) | no |
| `retailSalePrice` | `mrp-non-compliance` | Rule 6(e) | no |
| `countryOfOrigin` | `country-of-origin-missing` | Rule 6 | **yes** |
| `consumerCareDetails` | `consumer-care-details-missing` | Rule 6 | no |

### `FontSizeCheck` — the Rule 7 check

| Field | Type | Optional |
|---|---|---|
| `fieldId` | `"netQuantity" \| "retailSalePrice"` | no |
| `measuredHeightMm` | `number` | no |
| `requiredHeightMm` | `number` | no |
| `embossed` | `boolean` | no |
| `passed` | `boolean` | no |

Kept structurally separate from the general confidence score because 04 §2 is
explicit that it must not be flattened into it. The legal rule: MRP and net-quantity
numerals require a minimum 4 mm height, or 6 mm where the declaration is blown,
moulded or embossed onto the container. **No real measurement happens.**

### `ExtractionResult`

`{ scanId, processingStatus, overallConfidence (0–100), declarations[], fontSizeChecks[], failureReason? }`.

### `ScrapedListing` / `EcommerceBatch`

`ScrapedListing` = `{ id, listingUrl, title, descriptionExcerpt, images[], status: "queued"|"scanning"|"done"|"failed", failureReason?, recordId? }`.
`EcommerceBatch` = `{ id, sourceUrl, listings[], createdAt }`.
**All scraped content is fixture data.** See section 4.

## 2.4 `compliance.ts`

### `ComplianceRecord` — the spine of the product

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `id` | `string` | no | `rec-<scanId>` for live records; `rec-1001`…`rec-1012` for seeds. |
| `scanId` | `string` | no | Human-facing identifier, `LMCS-<year>-<6 digits>`. **Synthesized** from digits in the internal scan id. |
| `productName` | `string` | no | **PLACEHOLDER for two of three intake paths.** See below. |
| `manufacturerName` | `string` | no | Metadata, or `"Unidentified (citizen report)"`, or the first seeded manufacturer as a fallback. |
| `category` | `ProductCategory` | no | Metadata. |
| `region` | `string` | no | Metadata. |
| `source` | `SourceTag` | no | Set by the intake path. |
| `verificationStatus` | `VerificationStatus` | no | `Extracted` on creation, `Verified` after confirm. |
| `complianceStatus` | `ComplianceStatus` | no | Always via `computeComplianceStatus()`. |
| `needsReviewFlag` | `boolean` | no | The manual escalation. Overrides computed status. |
| `needsReviewByUserId` | `string` | yes | Set with the flag, deleted when cleared. |
| `needsReviewNote` | `string` | yes | Optional note, deleted when cleared. |
| `flaggedForEnforcement` | `boolean` | no | Set once; relabels the action. |
| `checklist` | `DeclarationCheck[]` | no | Eight lines: seven declarations plus one `fontSize` line. **Rule-engine output, currently seeded.** |
| `violations` | `Violation[]` | no | Derived from failed checklist lines. |
| `complianceScore` | `ComplianceScore` | yes | **Absent until Verified.** Placeholder formula; see below. |
| `extraction` | `ExtractionResult` | no | The pipeline's output. |
| `evidence` | `Evidence[]` | no | Supporting photographs attached after the fact. Empty in practice — no attach UI ships. |
| `auditTrail` | `AuditEvent[]` | no | **The coarse projection**, maintained by the audit store. |
| `thumbnail` | `UploadedImage` | no | The front captured image, or a category placeholder SVG. |
| `capturedImages` | `UploadedImage[]` | no | Exactly three entries (front, back, side_pdp), placeholder-filled where nothing was captured. |
| `ecommerceListingUrl` | `string` | yes | Either intake path. |
| `batchId` | `string` | yes | Bulk e-commerce scans only. |
| `citizenReport` | `CitizenReportDetails` | yes | Citizen submissions only. |
| `scannedAt` | `string` (ISO 8601) | no | Creation. |
| `lastUpdatedAt` | `string` (ISO 8601) | no | Every mutation. |
| `archived` | `boolean` | no | Admin-only archive action. |

**`productName` is an explicit, still-open placeholder.** `buildFinalRecord()` in
`src/lib/server/scan-pipeline-store.ts:401` synthesizes it as
`` `${manufacturerName} — ${metadata.category}` `` whenever `metadata.productName` is
absent. Only the E-commerce Listing Scanner supplies a real one (the scraped
listing's title). **Both the officer scan wizard and the citizen portal produce
synthesized names**, because 03 §2's metadata form has no product-name field. The
TODO at that line records it. Adding the field to the wizard closes it for the
officer path; the citizen path may never have one.

### `DeclarationCheck`

`{ fieldId (a DeclarationFieldId or the literal "fontSize"), passed, value: string|null, violationCategoryId?, detail? }`.
`detail` carries the citable specifics — the difference between "non-compliant" and
"MRP Non-Compliance — Rule 6(e), numeral height 3 mm, below required 4 mm minimum".

### `Violation`

`{ categoryId, category (verbatim taxonomy wording), legalBasis, detail? }`. Always
resolved through `violationCategory()`, never retyped.

### `ComplianceScore`

`{ value: number, band: "Excellent"|"Good"|"Poor"|"Critical", breakdownByCategory: Partial<Record<ViolationCategoryId, number>> }`.

**Band cutoffs (`complianceScoreBand`)**: ≥ 90 Excellent, ≥ 70 Good, ≥ 40 Poor,
below 40 Critical. The spec itself calls these placeholder wording.

**`computeComplianceScore()` is an explicit placeholder formula**: the proportion of
checklist lines that passed, rounded. The comment states the frontend renders
whatever this returns so a real formula can replace it without touching rendering
code. **Absent until a record is Verified** — an unverified record has nothing to
score.

### `AuditEvent` — the coarse per-record projection

`AUDIT_EVENT_TYPES`: `Scanned`, `Extracted`, `Corrected`, `Verified`,
`Report Generated`, `Flagged for Enforcement`, `Flagged as Needs Review`.

`{ id, type, at (ISO 8601), byUserId?, byUserName?, note? }`. `byUserId` is absent
for system-generated events.

### `Evidence`

`{ id, image: UploadedImage, caption, attachedAt, attachedByUserId }`. **Typed but
not wired to a UI** — no attach-evidence control ships, and every record's `evidence`
array is empty.

### `RecordFilters`, `RecordSort`, `RecordsPage`

```ts
interface RecordFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  categories: ProductCategory[];
  complianceStatuses: ComplianceStatus[];
  regions: string[];
  manufacturers: string[];
  sources: SourceTag[];
  violationCategoryIds: ViolationCategoryId[];
  batchIds: string[];
}
```

`RECORD_SORT_OPTIONS`: `newest`, `oldest`, `alphabetical`, `status`, `relevance`.
`RecordsPage` = `{ rows: ComplianceRecord[], totalCount, page, pageSize }`.

Note the asymmetry: five fields are required arrays (empty means no filter), three
are optional strings. `exactOptionalPropertyTypes` is on, so `undefined` may not be
assigned to an optional key — the key must be absent.

## 2.5 `history.ts` — the central activity log

### `ActivityEventType` — seventeen values

`scan_created`, `image_quality_failed`, `image_quality_passed`, `ocr_completed`,
`ocr_fallback_used`, `ocr_retried`, `llm_structuring_completed`,
`rule_engine_completed`, `field_corrected`, `confirm_and_verify`,
`flagged_needs_review`, `needs_review_cleared`, `flagged_for_enforcement`,
`report_generated`, `report_downloaded`, `record_archived`, `case_reassigned`.

Three deliberate departures from the spec's list, recorded in the file:
`needs_review_cleared` and `ocr_retried` were **added** because both are real actions
that were previously unlogged; `case_reassigned` is **declared but never emitted**
because it belongs to the unbuilt Admin Console.

**Also never emitted today: `report_downloaded`.** It is declared and mapped but no
call site produces it. Both unemitted types appear in the Activity Log filter and
always return nothing.

### `ActivityEvent`

| Field | Type | Optional | Populated by |
|---|---|---|---|
| `id` | `string` | no | Monotonic, `act-000001`. Used as a tie-breaker in sorting. |
| `recordId` | `string` | no | Every event belongs to a record. |
| `type` | `ActivityEventType` | no | The emitting call site. |
| `actorUserId` | `string` | yes | **Absent for system events and for citizen submissions.** |
| `actorRole` | `Role` | yes | Resolved from the actor at emit time. |
| `detail` | `string` | yes | Human-readable one-liner. Never the only carrier of structured data. |
| `fieldId` | `DeclarationFieldId` | yes | Present on `field_corrected`. |
| `oldValue` | `string` | yes | Present on `field_corrected`. |
| `newValue` | `string` | yes | Present on `field_corrected`. |
| `region` | `string` | yes | **Denormalised deliberately** — copied at emit time, not joined, because an event is a historical fact and correcting a record's region later must not rewrite where past events happened. |
| `createdAt` | `string` (ISO 8601) | no | Emit time, or an explicit `at`. |

### `ACTIVITY_TO_AUDIT_TYPE`

A total map from all seventeen activity types to an `AuditEventType` or `null`.
**Seven map to a coarse type; ten map to `null`** and stay out of page 6's timeline.
This is what keeps the per-record timeline readable while the store records
everything.

### Querying

`SYSTEM_ACTOR_FILTER = "__system"` and `CITIZEN_ACTOR_FILTER = "__citizen"` are two
actor filter values that are not users, because most events have no actor.

```ts
interface ActivityFilters {
  actorUserIds: string[];   // user ids plus the two sentinels
  types: ActivityEventType[];
  regions: string[];
  dateFrom?: string;
  dateTo?: string;
  recordId?: string;        // deep-link only
}
```

`ACTIVITY_SORT_OPTIONS`: `newest`, `oldest`.
`ActivityPage` = `{ rows: ActivityEvent[], totalCount, page, pageSize }`.
`ACTIVITY_LOG_DEFAULT_WINDOW_THRESHOLD = 2000` — **deliberately unused**, naming the
volume at which a default date window becomes the right call.

## 2.6 `grievance.ts`

`GRIEVANCE_CONCERNS`: `priceNotShown`, `noManufacturerInfo`, `textTooSmall`, `other`.
Plain language on purpose — the public should not need to know the taxonomy.

### `GrievanceSubmission` (client-side form shape)

`{ photo: UploadedImage (the one required field), concerns[], concernNote?, shopNameOrLocation?, submitterName?, submitterContact? }`.

### `CitizenReportDetails` (what travels onto the record)

`{ concerns[], concernNote?, shopNameOrLocation?, hasContactDetails: boolean, reference: string }`.

**Contact details are deliberately absent from this type.** They are PII and
`ComplianceRecord` is served by the broadly-readable `/api/records`, so name and
contact stay in the grievance store keyed by reference. Only the boolean travels.
**A real backend must preserve this separation.**

### `GrievanceReceipt`, `GrievanceStatusLookup`, `PhotoQualityHint`

`GrievanceReceipt` = `{ reference, submittedAt }`.
`GrievanceStatusLookup` = `{ reference, status: PublicGrievanceStatus, lastUpdatedAt }`.
`PhotoQualityHint` = `{ isLikelyPoorQuality: boolean, reason?: "blurry"|"dark" }`.

### Sentinels

- `CITIZEN_ACTOR_ID = "citizen-public"` — not a mock user id, because a citizen is
  genuinely not a user and inventing one would put a fourth actor into a
  three-role matrix.
- `CITIZEN_REGION_SENTINEL = "Not specified"` — a citizen submission has no
  inspection region and nothing specifies how one would acquire it. Shows as its own
  bucket in the regional breakdown rather than inflating a real state.
- `UNIDENTIFIED_MANUFACTURER = "Unidentified (citizen report)"` — without it,
  `buildFinalRecord` would file an anonymous complaint against a real company.

## 2.7 `report.ts`

`REPORT_FORMATS`: `PDF`, `DOCX`. XLSX was deliberately removed rather than left
typed-but-unproducible. `REPORT_FORMAT_FILE` maps each to its extension and MIME type.

`LARGE_REPORT_ROW_THRESHOLD = 100` — rows above which the builder warns.

```ts
type ReportScope =
  | { kind: "record"; recordId: string }
  | { kind: "manufacturer"; manufacturerId: string }
  | { kind: "filtered"; filters: RecordFilters };
```

`REPORT_STAGE_IDS`: `collecting`, `rendering`, `finalising`.
`ReportStage` = `{ id, state: "pending"|"in_progress"|"completed"|"failed", summary?, failureReason? }`.
`ReportRun` = `{ id, stages[], status: "idle"|"generating"|"completed"|"failed", report? }`.
`ReportBlockReason`: `zero-records` | `no-format`.

### `GeneratedReport`

`{ id, name, scope, formats[], generatedAt, generatedByUserId, generatedByUserName, referenceCode, rowCount }`.

**There is deliberately no `downloadUrls` field.** Generated files are never stored;
the download route re-renders from `scope` on every request.

### `ReportAttribution` — three variants, deliberately

```ts
type ReportAttribution =
  | { kind: "verifier"; name: string; role: Role; region: string; verifiedAt: string }
  | { kind: "compiler"; name: string; role: Role; region: string; compiledAt: string }
  | { kind: "unverified" };
```

A multi-record report names a *compiler*, not a verifier, because the current user
did not verify the constituent records. Presenting them as the verifier would be
wrong on a document that may end up in an enforcement file.

### `ReportDocument`, `ReportRecordSection`, `ReportViolationLine`

One assembly, three renderers (preview, PDF, DOCX) so what a user previews is what
they download.

`ReportDocument` = `{ title, scopeDescription, generatedAt, referenceCode, verifyUrl, attribution, records[], totalRecords, truncated }`.

### `ReportAccessibility`

`{ pdfIsTagged: boolean }` — **always `false` today**, reported honestly because
jsPDF emits no `/StructTreeRoot`. A real backend renderer that produces tagged PDFs
should flip this.

### `ProfileDetails`, `NotificationSettings`

`ProfileDetails` = `{ fullName, username, email, role, department }`.
`NotificationSettings` = `{ inApp, email, sms }` — **`email` and `sms` are typed but
default to false and have no delivery mechanism.**

## 2.8 `analytics.ts`

`KpiMetric` = `{ id: "productsScanned"|"compliant"|"nonCompliant"|"pending", value, percentageOfTotal?, deltaPercentage, routesToStatus? }`.
`TrendPoint` = `{ date, compliant, nonCompliant, totalScans }`. `TrendPeriod` = `weekly` | `monthly`.
`DashboardAlert` = `{ id, severity: "info"|"warning"|"error", message, href }`.
`AnalyticsSummary` = `{ totalScanned, complianceRatePercentage, processingSuccessRatePercentage }`.
`ViolationBreakdownEntry` = `{ categoryId, count }`.
`CategoryBreakdownEntry` = `{ category, compliant, nonCompliant }`.
`RegionBreakdownEntry` = `{ region, totalScanned, nonCompliant }`.
`SourceBreakdownEntry` = `{ source, count }`.
`AnomalyAlert` = `{ id, title, description, severity, href }`.
`AnalyticsData` bundles all of the above.

**`AnomalyAlert` is described in the type as "backend-detected"** but is currently
fixture data. Real anomaly detection does not exist.

## 2.9 `manufacturer.ts`

`REPEAT_VIOLATION_THRESHOLD = { nonCompliantCount: 3, withinDays: 90 }` — **a frozen
constant awaiting the Rule Thresholds admin UI.** Admin-editable per BRD §9.5 and the
permission matrix, but no UI edits it.

`ManufacturerSummary` = `{ id, name, totalProductsScanned, complianceRatePercentage, firstScannedAt, lastScannedAt }`.
`ComplianceRatePoint` = `{ date, ratePercentage, sampleSize }` — `sampleSize` exists so a single-scan point can be labelled as thin data.
`ManufacturerScorecard` = `{ summary, repeatViolationFlagged, recentNonCompliantCount, complianceTrend[], violationBreakdown[], products: ComplianceRecord[] }`.

`MANUFACTURER_MATCHING_IS_EXACT = true` — a named constant carrying the documented
limitation that two spellings of one company are two manufacturers.

---

# 3. Complete API surface

**This is the contract to implement against.**

## Global facts that apply to every endpoint

1. **No endpoint performs authentication or authorization.** There is no session
   check, no token validation, no role check. Mutation endpoints take a `userId`
   string in the request body and trust it completely. Read endpoints identify
   nobody. This is uniform and deliberate for a prototype, and it is the single
   largest thing a real backend adds.
2. **All state is in-memory and process-local.** Every store resets on server
   restart. Two server instances would not share state.
3. **Error bodies are uniformly `{ "error": string }`** unless noted.
4. **Several endpoints return a 200 with a named failure rather than an HTTP error
   status.** This is deliberate, not sloppiness — the pattern is used where the user
   needs to be told precisely why something did not happen, rather than facing an
   inert control. Each instance is flagged below.
5. **Multi-value query parameters repeat their key** (`?types=a&types=b`), read with
   `URLSearchParams.getAll()`. Never comma-separated.
6. **Dates are ISO 8601 strings and are compared as raw strings**, not parsed. A
   `dateTo` filter is expanded to `${dateTo}T23:59:59.999Z` before comparison.

---

## 3.1 Records

### `GET /api/records`

**Auth:** none. **Implementation: REAL** (real filtering, sorting and pagination over
a live+seed merge — but over in-memory data).

**Query parameters** — all optional; multi-value keys repeat:

| Parameter | Repeats | Type |
|---|---|---|
| `categories` | yes | `ProductCategory` |
| `complianceStatuses` | yes | `ComplianceStatus` |
| `regions` | yes | `string` |
| `manufacturers` | yes | `string` |
| `sources` | yes | `SourceTag` |
| `violationCategoryIds` | yes | `ViolationCategoryId` |
| `batchIds` | yes | `string` |
| `query` | no | free-text; matched against product name, manufacturer name and scan id |
| `dateFrom` / `dateTo` | no | ISO date |
| `sort` | no | one of `RECORD_SORT_OPTIONS`; defaults to `newest` |
| `page` | no | 1-based; defaults to 1 |
| `pageSize` | no | defaults to 20 |

**Response 200:** `RecordsPage` — `{ rows: ComplianceRecord[], totalCount, page, pageSize }`.

**Notes:** archived records are excluded unconditionally; there is no "show archived"
view. The underlying merge (`getAllActiveRecords`) deduplicates live pipeline records
against static seeds by id, live winning.

---

### `GET /api/records/[id]`

**Auth:** none. **Implementation: REAL** lookup (in-memory).

Checks the pipeline store first (a freshly-piped record), then falls back to the
static seeds (an already-Verified record reopened later).

**Query parameters:** `demo=zero-declarations` — a QA convenience that auto-creates a
total-OCR-failure record when `id` matches nothing. **Remove or gate this in
production.**

**Response 200:** `ComplianceRecord`.
**Response 404:** `{ "error": "Record not found" }`.

---

### `POST /api/records/[id]/verify`

**Auth:** none server-side. **Intended:** Enforcement Officer, Admin
(`verification.confirm`). **Implementation: REAL** state transition; the underlying
data it verifies is mocked.

**Request body:**
```ts
{ userId: string }
```

**Response 200:** a `VerifyResult` object. **Critical:** verification is *blocked*
with a 200 and a populated `blockedFields` array when any declaration is still
`notDetected`. The caller must inspect the body, not the status.
**Response 400:** `{ "error": "userId is required" }`.
**Response 404:** `{ "error": "Record not found, or not writable" }` — **note the
"not writable" half**: static seed records have no backing pipeline run and cannot be
mutated at all. See section 4.

**Side effects:** sets `verificationStatus` to `Verified`, recomputes
`complianceStatus`, computes and attaches `complianceScore`, emits a
`confirm_and_verify` activity event.

---

### `POST /api/records/[id]/corrections`

**Auth:** none. **Implementation: REAL** write; the value being corrected is mocked data.

**Request body:**
```ts
{ fieldId: DeclarationFieldId, value: string, userId: string }
```

**Response 200:** the updated `ComplianceRecord`.
**Response 400:** `{ "error": "fieldId, value and userId are all required" }`.
**Response 404:** `{ "error": "Record not found, or not writable" }`.

**Side effects:** sets `corrected` and `correctedByUserId` on the declaration,
recomputes the checklist and status, emits a `field_corrected` activity event
carrying `fieldId`, `oldValue` and `newValue`.

---

### `POST /api/records/[id]/needs-review`

**Auth:** none. **Intended:** all three roles. **Implementation: REAL.**

**Request body:**
```ts
{ userId: string, note?: string, flag?: boolean }   // flag defaults to true
```

`flag: false` clears an existing flag rather than re-raising it.

**Response 200:** the updated `ComplianceRecord`.
**Response 400:** `{ "error": "userId is required" }`.
**Response 404:** `{ "error": "Record not found, or not writable" }`.

**Side effects:** sets or clears `needsReviewFlag`, `needsReviewByUserId` and
`needsReviewNote`; recomputes `complianceStatus`; emits `flagged_needs_review` or
`needs_review_cleared`.

---

### `POST /api/records/[id]/flag-enforcement`

**Auth:** none. **Intended:** Enforcement Officer, Admin. **Implementation: REAL**
flag set. **There is no enforcement workflow behind it** — nothing consumes the flag
beyond relabelling the button and appearing in the audit trail.

**Request body:** `{ userId: string }`.
**Response 200:** the updated `ComplianceRecord`. **400 / 404** as above.

---

### `POST /api/records/[id]/archive`

**Auth:** none. **Intended:** Admin only. **Implementation: REAL** soft delete
(`archived: true`).

**Request body:** `{ userId: string }`. The body is parsed with `.catch(() => null)`,
so a malformed body yields the 400 rather than a crash.
**Response 200:** the updated `ComplianceRecord`. **400 / 404** as above.

**Side effects:** emits `record_archived`. The record disappears from every list view.

---

### `POST /api/records/[id]/retry-ocr`

**Auth:** none. **Implementation: MOCKED.**

**What it fakes:** re-running extraction. It re-seeds the record's declarations as a
fresh, successful extraction. **A retry always succeeds.** It also silently discards
every correction already made, which is why it now requires a `userId` and emits
`ocr_retried` with a count of discarded corrections in the detail.

**Replace with:** a real re-invocation of the OCR pipeline for this record's stored
images, with a genuine possibility of failure.

**Request body:** `{ userId: string }`. **Response 200:** updated `ComplianceRecord`.
**400 / 404** as above.

---

### `POST /api/records/bulk/needs-review`

**Auth:** none. **Intended:** Admin only (`record.bulkStatusChange`).
**Implementation: REAL.**

Scoped to flagging and clearing Needs Review only. Arbitrary bulk status writes are
deliberately not offered.

**Request body:**
```ts
{ recordIds: string[], userId: string, flag: boolean }   // all required; recordIds non-empty
```

**Response 200:**
```ts
{ flagged: ComplianceRecord[], skipped: string[], alreadyFlagged: string[] }
```

**Response 400:** `{ "error": "recordIds (non-empty), userId and flag are all required" }`.

**Note:** `skipped` carries ids that could not be written — in practice, static seed
records.

---

## 3.2 Scan pipeline

### `POST /api/scan-pipelines`

**Auth:** none. **Implementation: MOCKED** — this is the heart of the fake.

**Request body:**
```ts
{
  scanId: string,                    // required
  scannedByUserId: string,           // required
  metadata: ScanMetadata,            // required
  images?: Array<{ angle: CaptureSlotAngle; fileName: string; url: string; sizeBytes: number }>,
  forceFailStage?: PipelineStageId,  // demo only
  fallbackOverride?: "used" | "skipped"  // demo only
}
```

**Response 201:** `PipelineRun` — `{ scanId, recordId, stages }`.
**Response 400:** `{ "error": "scanId, metadata and scannedByUserId are all required" }`.

**What it fakes:** everything. No image is uploaded anywhere, no OCR runs, no LLM is
called, no rules are evaluated. Stage progression is derived from elapsed wall-clock
time against a fixed duration table. Stage outcomes are **seeded at creation**, not
computed from any prior stage's output.

**Critical omission for integration:** this handler **does not accept `source`,
`batchId`, `citizenReport` or `qualityNote`, and silently drops them.** That is why
the e-commerce and grievance paths bypass it and call `createPipelineRun()` directly
from their own server modules. See section 7.

---

### `GET /api/scan-pipelines/[scanId]`

**Auth:** none. **Implementation: MOCKED** progress.

**Response 200:** `PipelineRun`. **Response 404:** `{ "error": "Pipeline run not found" }`.

Progress is recomputed on every read from `currentStageStartedAt` and `Date.now()`.
A poll after a long gap fast-forwards correctly through however many stages have
"elapsed" — there is no timer to survive a restart. **This design property is worth
keeping** even with a real pipeline, for a different reason: it makes progress
resilient to a dropped connection.

---

### `POST /api/scan-pipelines/[scanId]/retry/[stageId]`

**Auth:** none. **Implementation: MOCKED** — a retry always succeeds.

**Response 200:** the updated `PipelineRun`.
**Response 400:** `{ "error": "Unknown stage" }` when `stageId` is not in `PIPELINE_STAGE_IDS`.
**Response 404:** `{ "error": "Pipeline run not found, or that stage is not currently failed" }`.

Retry is stage-scoped and does not restart earlier completed stages. Nothing
downstream needs invalidating because a failed stage blocks all forward progress by
construction and stage outcomes were never data-dependent.

---

## 3.3 Mobile handoff

The session model here is **sound and should carry over** — see section 8.

### `POST /api/mobile-sessions`

**Auth:** none. **Implementation: REAL** session mechanics, in-memory storage.

**Request body:** `{ scanDraftId: string }`.
**Response 201:** `MobileHandoffSession`.
**Response 400:** `{ "error": "scanDraftId is required" }`.

Token is a collision-checked unambiguous short code. TTL is **5 minutes**.

---

### `GET /api/mobile-sessions/[token]`

**Auth:** the token itself. **Implementation: REAL.**

**Response 200:** `MobileHandoffSession`, with `status` resolved to `expired` if past
`expiresAt`. **Response 404:** `{ "error": "Session not found" }`.

---

### `DELETE /api/mobile-sessions/[token]`

**Auth:** the token. **Implementation: REAL.** The desktop's Cancel action.

**Response 200:** the session with `status: "cancelled"`. **404** as above.

---

### `POST /api/mobile-sessions/[token]/connect`

**Auth:** the token. **Implementation: REAL.** The phone joining.

**Request body:** none.
**Response 200:** the session with `status: "connected"`.
**Response 404:** `{ "error": "Session not found, expired, or already used" }` — one
message for three cases deliberately, so the endpoint cannot be probed for valid
tokens.

---

### `POST /api/mobile-sessions/[token]/capture`

**Auth:** the token. **Implementation: REAL** transport; **the photo is a base64 data
URL in memory.**

**Request body:**
```ts
{
  angle: CaptureSlotAngle,   // required
  fileName: string,          // required
  sizeBytes: number,         // required
  dataUrl: string            // required — a data: URL
}
```

**Response 200:** the updated `MobileHandoffSession`.
**Response 400:** `{ "error": "angle, fileName, sizeBytes and dataUrl are all required" }`.
**Response 404:** `{ "error": "Session not found or not connected" }`.

**This endpoint is the clearest object-storage replacement target in the app.** See
section 5.

---

## 3.4 Grievances (public)

### `POST /api/grievances`

**Auth:** none, by design. **THE ONLY ENDPOINT MEANT TO BE PUBLIC.**
**Implementation: REAL** submission handling; the record it creates goes through the
mocked pipeline.

**Request body:**
```ts
{
  photo: { fileName: string; url: string; sizeBytes: number },   // required
  concerns?: GrievanceConcern[],
  concernNote?: string,
  shopNameOrLocation?: string,
  submitterName?: string,
  submitterContact?: string,
  qualityNote?: string,      // from the client-side advisory check; recorded, never used to reject
  website?: string           // HONEYPOT — see below
}
```

**Responses:**

| Status | Body | Meaning |
|---|---|---|
| 201 | `{ reference: string, submittedAt: string }` | Accepted. |
| 202 | `{ accepted: true }` | **Honeypot triggered.** The `website` field is hidden from people. A filled one gets a success-looking response and is dropped without being stored, so an automated submitter sees success and has no signal to adapt to. |
| 400 | `{ "error": "A submission body is required" }` | Unparseable body. |
| 400 | `{ "error": "A photo is required" }` | Missing `photo.fileName` or `photo.url`. |
| 413 | `{ "error": "That photo is too large. Please attach one under 8 MB." }` | `sizeBytes > 8 MB` or `url.length > 16 MB`. |
| 429 | `{ "error": "Too many reports from this connection. Please try again later." }` plus a `Retry-After` header in seconds | Rate limit. |

**Side effects:** creates a `Citizen-Reported` pipeline run with a synthesized
category (`"Other"`) and region (`"Not specified"`), immediately completes it via
`completePipelineRunNow()` because nothing polls a citizen submission, and stores
name/contact in the grievance store **keyed by reference and never on the record**.

**Client key derivation:** `x-forwarded-for`, first entry, falling back to
`"unknown-client"`. **Trivially forged, which is exactly why the guard is described
as demo-grade.**

---

### `GET /api/grievances/[reference]`

**Auth:** none, by design. **Implementation: REAL.**

**Response 200:** `GrievanceStatusLookup` — `{ reference, status, lastUpdatedAt }`.
**Response 404:** `{ "error": "No report found with that reference" }` — **identical
whether the reference never existed or is malformed**, so the endpoint cannot be used
to enumerate valid references.

**The public status mapping is a judgement call no spec defines:**

| Internal state | Public status |
|---|---|
| Verified and not flagged Needs Review | `Resolved` |
| Needs Review flag set, or any `Corrected` audit event | `Under Review` |
| Anything else, including a run that has not produced its record yet | `Received` |

**`Compliant` and `Non-Compliant` both map to `Resolved`.** A citizen learns their
report was worked, never the enforcement outcome, the officer, or the rule. An
archived record still reports its last public status rather than vanishing.

---

## 3.5 E-commerce

### `POST /api/ecommerce/scrape`

**Auth:** none. **Implementation: FULLY MOCKED.**

**Request body:** `{ url: string, mode?: "single" | "bulk" }` (`mode` defaults to `single`).

**Response 200 always** — failures come back in the body, never as an HTTP error,
because each must read as its own specific message:
```ts
{ ok: boolean, failure?: "invalid_url" | "unrecognized" | "empty" | "rate_limited",
  listing?: ScrapedListing, listings?: ScrapedListing[] }
```

**What it fakes:** all of it. It validates the URL is `http:` or `https:`, checks for
magic substrings (`no-product`, `empty`, `rate-limited`) that force each failure
state, and otherwise returns fixture listings. **No HTTP request is ever made to any
e-commerce site.**

**Replace with:** a real scraping service. Note BRD R-03 anticipates platform rate
limiting and blocking as a real operational risk.

---

### `POST /api/ecommerce/scan`

**Auth:** none. **Implementation:** real orchestration over the **mocked** pipeline.

**Request body:** `{ listing: ScrapedListing, metadata: ScanMetadata, scannedByUserId: string }` — all required.
**Response 201:** the created scan/run descriptor including the scan id, so the page
can route to the shared Processing Pipeline Tracker.
**Response 400:** `{ "error": "listing, metadata and scannedByUserId are all required" }`.

---

### `POST /api/ecommerce/batches`

**Auth:** none. **Implementation:** real orchestration over the mocked pipeline.

**Request body:**
```ts
{ sourceUrl: string, listings: ScrapedListing[], selectedIds: string[],
  metadata: ScanMetadata, scannedByUserId: string }
```

**Response 201:** the created batch.
**Response 400:** `{ "error": "sourceUrl, listings, metadata and scannedByUserId are all required" }`
or `{ "error": "Select at least one listing to scan" }`.

Starts one independent pipeline run per selected listing. Unselected listings stay in
the batch as `queued` so the officer still sees what was found and chose to skip.

---

### `GET /api/ecommerce/batches/[batchId]`

**Auth:** none. **Implementation: REAL** derivation over mocked runs.

**Response 200:** `{ batch: EcommerceBatch, scanIds: string[] }`.
**Response 404:** `{ "error": "Batch not found" }`.

Each listing's status is derived fresh from its own pipeline run on every read —
never stored — so one listing failing cannot block or hide another.

---

## 3.6 Reports

### `GET /api/reports`

**Auth:** none. **Implementation: REAL** (in-memory).
**Response 200:** `{ reports: GeneratedReport[], total: number }`.

---

### `POST /api/reports/scope`

**Auth:** none. **Implementation: REAL.**

Answers how many records a scope covers **without generating anything**, backing both
the zero-record block and the large-scope warning, which must be known before the
user commits. A POST rather than a GET because a filtered scope carries a whole
`RecordFilters` object.

**Request body:** `{ scope: ReportScope }`.
**Response 200:** `{ rowCount: number, large: boolean, label: string }`.
**Response 400:** `{ "error": "A scope is required" }`.

`large` is `rowCount > 100`. A filtered scope is capped at `MAX_SCOPE_ROWS = 1000`.

---

### `POST /api/reports/generate`

**Auth:** none. **Intended:** all three roles. **Implementation:** **MOCKED timing**
around **REAL** rendering.

**Request body:**
```ts
{ scope: ReportScope, formats: ReportFormat[], userId: string, userName: string,
  forceFailStage?: ReportStageId }
```

**Response 200:** a `ReportRun`. **Blocked runs return 200 with `blocked` populated**,
not an error status — the user clicks and is told precisely why.
**Response 400:** `{ "error": "scope, userId and userName are all required" }`.

The three-stage progress is faked with a duration table. **What it produces at the
end is genuinely real.**

---

### `GET /api/reports/runs/[runId]`

**Auth:** none. **Implementation:** MOCKED progress, derived from elapsed time on read.
**Response 200:** `ReportRun`. **Response 404:** `{ "error": "Report run not found" }`.

---

### `POST /api/reports/runs/[runId]/retry/[stageId]`

**Auth:** none. **Implementation:** MOCKED — retry always succeeds.
**Response 200:** the updated `ReportRun`.
**Response 400:** `{ "error": "Unknown report stage" }`.
**Response 404:** `{ "error": "Report run not found, or that stage is not failed" }`.

The scope lives on the run, so retrying resumes rather than asking the user to
rebuild their selection.

---

### `GET /api/reports/[id]`

**Auth:** none. **Implementation: REAL** document assembly.

**Response 200:**
```ts
{ report: GeneratedReport, document: ReportDocument, accessibility: { pdfIsTagged: false } }
```
**Response 404:** `{ "error": "Report not found" }`.

The `document` is what the in-browser preview renders, built by the same
`buildReportDocument()` the PDF and DOCX read, so the preview cannot drift from what
downloads.

---

### `GET /api/reports/[id]/download/[format]`

**Auth:** none. **Implementation: FULLY REAL.** This produces genuine files.

`format` is case-insensitive; `pdf` and `docx` are accepted.

**Response 200:** the binary file, with headers:
- `Content-Type`: `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `Content-Disposition`: `attachment; filename="<reportId>-<referenceCode>.<ext>"`
- `Content-Length`

**Response 400:** `{ "error": "Unsupported format: <format>" }`.
**Response 404:** `{ "error": "Report not found" }` or `{ "error": "This report was not generated as <FORMAT>" }`.

**Design note worth preserving:** the file is **re-rendered from the stored scope on
every request** rather than served from storage. That is what makes indefinite
re-download work with no file store and no expiry policy. The stated trade-off: a
re-download reflects the records as they are *now*, not as they were when first
generated. For a live compliance system that is arguably more useful, but it is a
real difference from a stored artefact, and a legal-evidence use case may require the
opposite.

---

## 3.7 Analytics, manufacturers, activity

### `GET /api/analytics`

**Auth:** none. **Intended:** all roles. **Implementation: REAL** aggregation over
in-memory data; **anomaly alerts are fixtures.**
**Response 200:** `AnalyticsData`.

---

### `GET /api/manufacturers`

**Auth:** none. **Implementation: REAL** aggregation.
**Response 200:** `{ scorecards: ManufacturerScorecard[], total: number }`.

---

### `GET /api/manufacturers/[id]/scorecard`

**Auth:** none. **Implementation: REAL** aggregation.
**Response 200:** `ManufacturerScorecard`.
**Response 404:** `{ "error": "Manufacturer not found" }` — 404s rather than returning
an empty scorecard, so a dashboard deep link either lands on real data or fails
honestly.

---

### `POST /api/manufacturers/[id]/flag-enforcement`

**Auth:** none. **Intended:** Enforcement Officer, Admin. **Implementation: REAL** flag.

Takes the manufacturer **id** and resolves the name server-side, so a client cannot
flag an arbitrary name string that never appears in the list.

**Request body:** `{ userId: string }`.
**Response 200:** the flag result.
**Response 400:** `{ "error": "userId is required" }`.
**Response 404:** `{ "error": "Manufacturer not found" }`.

---

### `GET /api/activity`

**Auth:** **none server-side** — the page and nav gate on `activity.view` and this
trusts that gate. **Worth naming plainly given this endpoint returns an audit log:
anyone can read the complete activity log of every officer with one unauthenticated
GET.** This is an app-wide gap, not one this route introduces, but it is the endpoint
where it matters most.

**Implementation: REAL** filtering, sorting and pagination.

**Query parameters:**

| Parameter | Repeats | Notes |
|---|---|---|
| `actorUserIds` | yes | user ids, plus `__system` and `__citizen` |
| `types` | yes | `ActivityEventType`; unknown values are filtered out |
| `regions` | yes | exact match; an event with no region never matches a region filter |
| `dateFrom` / `dateTo` | no | ISO dates, string-compared; `dateTo` is expanded to end-of-day |
| `recordId` | no | deep-link only |
| `sort` | no | `newest` (default) or `oldest` |
| `page` / `pageSize` | no | default 1 and 20 |

**Response 200:**
```ts
{
  rows: ActivityEvent[],
  totalCount: number,
  page: number,
  pageSize: number,
  availableRegions: string[],              // regions actually present in the log
  recordLabels: Record<string, string>     // record id -> human-facing scan id
}
```

`recordLabels` is sent from the server deliberately: a live-created record exists only
in the server process, so a client building this map from seed data alone renders a
raw `rec-…` id for exactly the records made in the current session. Sorting uses
`createdAt` with the monotonic `id` as a tie-breaker, because the seed backfill
produces events sharing a timestamp by design.

---

## 3.8 Endpoints that do not exist but the frontend expects

- **`POST /auth/login`** — `src/lib/api/auth.ts` has a real `fetch` branch pointed at
  `${NEXT_PUBLIC_API_BASE_URL}/auth/login`, active when `NEXT_PUBLIC_USE_MOCK_DATA`
  is `"false"`. It expects **401** for bad credentials, any other non-OK for
  "service unavailable", and a `Session` JSON body on success. **Nothing serves this
  route today.**
- **A quality-check upload endpoint** — `API.scans.qualityCheck`, reached by
  `checkImageQuality`'s non-mock branch via multipart `FormData` with `angle` and
  `file`. **Nothing serves it.**
- **A notifications source** — the header's notification count is sourced from
  dashboard alert fixtures with a TODO recording it.

---

# 4. The mock-vs-real gap list, prioritized

Ordered by what a backend team should fix first. Priority reflects both the problem
statement's core technical ask and the risk of the gap being mistaken for working
software.

---

## P0 — The officer-facing image quality gate

**What it fakes:** the entire Image Quality Inspection Layer on the primary intake
path.

**Where:** `checkImageQuality()` in `src/lib/api/scans.ts:119`, called from
`useCaptureSlots.submitImage`.

**What it actually does:** waits 400–700 ms, then returns `{ passed: true }`. It
**never inspects the file**. The only way to see a failure is a `?demo=quality-blur`
style URL parameter that forces a specific `QualityFailureReason`.

**Why this is first, and why it is the most dangerous gap in the product:** it is
inconsistent with the citizen path, and inconsistent in the wrong direction.

| | Officer path (page 3) | Citizen path (page 11) |
|---|---|---|
| Implementation | **Mocked — always passes** | **Real** canvas analysis |
| File | `src/lib/api/scans.ts` | `src/lib/utils/photoQuality.ts` |
| What it measures | nothing | mean luminance and variance of the Laplacian on a 96px downscale |
| Failure vocabulary | `blur`, `distortion`, `curvature`, `no_text_detected` | `blurry`, `dark` |
| Behaviour on failure | **blocks** submission | **advisory only**, never blocks |

The citizen portal — the lower-stakes, best-effort path — does real image analysis.
The officer portal — where a bad photograph produces a bad extraction that produces a
bad compliance determination that may end up in an enforcement file — does none. The
`photoQuality.ts` doc comment states this explicitly.

**How convincing / how risky:** extremely convincing and extremely risky. The UI
shows "Checking…", then a pass. A demo never reveals it. An officer would reasonably
believe their photographs were validated.

**Replace with:** a real inspection service producing the four documented failure
reasons. The citizen-side Laplacian-variance and luminance work is a reasonable
starting point for blur and darkness but does not cover distortion, curvature or
no-text-detected. Note the vocabularies differ deliberately and should probably stay
separate — one gates, one advises.

---

## P1 — The OCR pipeline (PaddleOCR primary + Gemini fallback)

**What it fakes:** all text extraction.

**Where:** `seedDeclarations()` at `src/lib/server/scan-pipeline-store.ts:174`;
stage timing in `STAGE_DURATION_MS` at line ~88.

**What it actually does:** returns seven fixture declaration values from
`SAMPLE_VALUES`, with confidence synthesized as `92 + (index % 6)` — or `82` for the
one field seeded as needing fallback. The `sourceEngine` badge reads
`gemini_fallback` for exactly one field (Country of Origin) and `paddleocr` for the
rest, chosen at seed time. `sourceImageAngle` comes from a static per-field map.
**No image is ever read.** The `textExtraction` stage takes 900 ms and
`fallbackExtraction` 700 ms because those are the numbers in the table.

**How convincing / how risky:** highly convincing — the confidence percentages, the
bands, the engine badges and the per-field source images all look like real pipeline
output. This is the product's headline technical claim and none of it exists.

**Replace with:** a real PaddleOCR invocation per captured image, a confidence
threshold triggering a Gemini (or equivalent VLM) second pass on low-confidence
fields only, and genuine per-field provenance. **The confidence threshold that
triggers fallback is not currently a constant anywhere** — the fallback field is
hardcoded. See section 9.

---

## P2 — The rule engine (Rules 6, 7, 8/9)

**What it fakes:** every compliance determination.

**Where:** `seedDeclarations()` builds the checklist and violations inline; the
`ruleEngine` stage summary at `scan-pipeline-store.ts` line ~318 just counts the
pre-seeded violations.

**What it actually does:** marks all seven declarations as passing (unless the
all-missing demo is active), then appends **one deliberate, always-present font-size
violation** — "MRP numeral height 3 mm, below the required 4 mm minimum" — so the
stage has something to report. Every normally-processed record in the system has
exactly one violation, always the same one.

**The Rule 7 check specifically:** `FontSizeCheck` is fully typed with
`measuredHeightMm`, `requiredHeightMm` and `embossed`, and the type comment correctly
identifies it as "the PS-specific check a judge will look for". **No measurement
happens.** The 3 mm figure is a string in a fixture.

**Rules 8/9** (`non-standard-or-misleading-format`) exist in the taxonomy and are
**never evaluated at all** — no code path produces that category.

**How convincing / how risky:** convincing on a single record, obvious across many —
every record showing the identical violation is a tell. Risky because the legal
citations are correct and specific, which lends unearned authority.

**Replace with:** a real rule engine evaluating the Legal Metrology (Packaged
Commodities) Rules 2011 against structured extraction output, with genuine numeral
height measurement in millimetres calibrated against a physical reference in the
image.

---

## P3 — The LLM structuring step

**What it fakes:** reconciling raw OCR text into the seven structured declarations
across three images.

**Where:** the `structuring` stage; summary is the fixed string "Fields reconciled
across all captured images."

**What it actually does:** waits 700 ms. The declarations were already fully formed
at seed time, so there is nothing to structure.

**How convincing / how risky:** moderately convincing, low individual risk, but it is
load-bearing for P1 and P2 — without real structuring there is nothing for a real
rule engine to evaluate.

**Replace with:** an LLM call taking raw per-image OCR output and producing the
`ExtractedDeclaration[]` shape, with per-field provenance back to a source image.

---

## P4 — Authentication and session management

**What it fakes:** all of it.

**Where:** `src/lib/api/auth.ts`, `src/lib/mock/users.ts`,
`src/components/shared/RequireAuth.tsx`, `src/lib/api/client.ts`.

**What it actually does:**
- **Three hardcoded users**, `usr-001` / `usr-002` / `usr-003`, with **one shared
  password, `Demo@2026`**, in a plaintext array in `src/lib/mock/users.ts:60-62`.
- The login screen **displays the valid usernames and the password on-screen** as a
  demo affordance.
- A "session" is the literal string `` `mock-session-${userId}` `` with a
  client-computed 30-minute expiry.
- It is stored in `sessionStorage` under `lmcs-token`.
- **`RequireAuth` is explicitly not a security boundary** — its own doc comment says
  so. `src/proxy.ts` stays locale-only because middleware cannot read
  `sessionStorage`. A cookie mirror was considered and rejected as a forgeable flag.
- **No API route validates anything.** Mutations accept a `userId` string in the body.

**How convincing / how risky:** not convincing at all to anyone who looks, and
maximally risky. There is no authentication in this application.

**Unresolved and blocking a real design:** BRD §15 Q-06 — whether the real method is
Aadhaar-linked, departmental SSO, or plain credentials. The client's request/response
shapes assume plain credentials. See section 11 for a recommendation.

**Also missing:** the pre-expiry session warning required by BRD A-11 / WCAG 2.2.1,
recorded as a TODO in `src/providers/AuthProvider.tsx:142`.

---

## P5 — All data persistence

**Every store is an in-memory `Map` or array in the Next.js server process. All
application state is lost on restart, and would not be shared between two instances.**

| Store | File | Holds | Lines |
|---|---|---|---|
| `runs` | `src/lib/server/scan-pipeline-store.ts` | Every pipeline run and the compliance record it produced. **The primary data store.** | 1582 |
| `events` | `src/lib/server/audit-store.ts` | Every activity event, flat, newest last. | 407 |
| `sessions` | `src/lib/server/mobile-session-store.ts` | Mobile handoff sessions and their base64 photos. | 102 |
| `grievances` + `submissionTimes` | `src/lib/server/grievance-store.ts` | Citizen references, PII, and the rate-limit counters. | 285 |
| `batches` | `src/lib/server/ecommerce-store.ts` | E-commerce batches and their listing/run mapping. | 247 |
| report runs + reports | `src/lib/server/report-store.ts` | Generation runs and download history. | 379 |

**Additional consequence that surprises people:** *static seed records cannot be
mutated at all*. Twelve seed records (`rec-1001`…`rec-1012`) exist to make the app
look populated, but they have no backing pipeline run, so `verifyRecord`,
`applyCorrection`, `flagRecordNeedsReview`, `archiveRecord` and
`retryExtractionForRecord` all return `undefined` for them and the API returns **404
"Record not found, or not writable"**. Only records created in the current server
session are writable. This is documented in `archiveRecord`'s doc comment as an
accepted limitation.

**Seed history is synthesized.** Because seed records have no run, their audit
timeline is derived at first read from the fields they carry
(`synthesizeSeedActivity` in `audit-store.ts`), producing 36 backfilled events.
Without it, an older record would show an empty timeline that reads as broken.

---

## P6 — E-commerce scraping

**What it fakes:** all listing retrieval.

**Where:** `scrapeListing()` and `scrapeCategory()` in `src/lib/server/ecommerce-store.ts`.

**What it actually does:** validates the URL is `http`/`https`, checks for magic
substrings (`no-product` → unrecognized, `empty` → empty, `rate-limited` → rate
limited), then returns fixture listings with a freshened id. **No network request is
ever made.**

**How convincing / how risky:** convincing in a demo because the magic-URL
affordance makes every failure state reachable. Risky mainly because real scraping is
substantially harder than the mock implies — BRD R-03 already flags platform rate
limiting and blocking.

---

## P7 — The grievance abuse guard

**What it fakes:** abuse prevention on the one public write endpoint.

**Where:** `checkRateLimit()` in `src/lib/server/grievance-store.ts`, plus the
honeypot in the route handler.

**What it actually does:** a counter in a `Map`, five submissions per hour per client
key, where the key is the first entry of `x-forwarded-for`. The store's own doc
comment is unusually direct: *"It is not abuse prevention and must not be described
as such."* It resets on restart, the IP is trivially spoofed with a forged header,
and a determined submitter defeats it from a second network in seconds.

**Why it exists anyway:** the alternative was a public endpoint accepting an image
with literally nothing in front of it, and a visible honest guard is easier to
replace than an absence nobody noticed.

**Replace with:** a rate limiter at the edge keyed on something harder to forge, a
bot check, and the server-side auth the product does not have.

---

## P8 — Assorted smaller fakes

| What | Where | Notes |
|---|---|---|
| **Compliance score formula** | `computeComplianceScore()` in `compliance.ts` | Proportion of passing checklist lines. Explicitly labelled a placeholder; rendering reads whatever it returns so a real formula drops in cleanly. |
| **Compliance score bands** | `complianceScoreBand()` | 90/70/40 cutoffs; the spec itself calls the wording placeholder. |
| **Anomaly detection** | `AnalyticsData.anomalies` | Typed as "backend-detected", actually fixtures. |
| **Notification count** | `src/components/layout/Header.tsx:32` | Sourced from dashboard alert fixtures with a TODO. |
| **Duplicate scan detection** | `Scan.duplicateOfScanId` | Field exists, nothing sets it. |
| **Evidence attachments** | `ComplianceRecord.evidence` | Type fully modelled, no attach UI, always empty. |
| **Report generation timing** | `report-store.ts` `STAGE_DURATION_MS` | Fake 600/1100/400 ms around genuinely real rendering. |
| **Retry always succeeds** | pipeline, report and OCR retries | No retry can fail. |
| **`productName` synthesis** | `scan-pipeline-store.ts:401` | Officer and citizen paths get `manufacturer — category`. |

---

# 5. File and image handling

**There is no object storage anywhere in this application.** Every image is either a
browser-local blob URL, a base64 data URL held in server memory, or a static
placeholder file. This section traces all four intake paths end to end because it
determines exactly what an S3-equivalent has to replace and where every reference
lives.

## 5.1 Path A — Scan wizard, upload or device camera (the main path)

1. The officer selects or captures a `File` in the browser.
2. `useCaptureSlots.submitImage` calls `checkImageQuality(file)`, which (mocked)
   returns pass without reading it.
3. **`URL.createObjectURL(file)`** at `src/lib/hooks/useCaptureSlots.ts:90` produces a
   `blob:` URL, stored as `UploadedImage.url` at line 97.
4. On submit, `createScan` posts to `POST /api/scan-pipelines` with
   `images: [{ angle, fileName, url, sizeBytes }]` — **the `url` is that blob URL string.**
5. `createPipelineRun` stores those objects on the run; `buildFinalRecord` copies them
   into `ComplianceRecord.capturedImages` and `thumbnail`.

**Consequence, and it is severe:** a `blob:` URL is scoped to the originating browser
document. **The image binary never leaves the browser.** The server stores a string
that is meaningless to anyone else and dead the moment the tab closes. A record
created in one tab and opened in another shows broken images. The bytes are simply
never transmitted.

## 5.2 Path B — Mobile handoff

1. The phone captures a `File`.
2. `MobileCaptureView.tsx:41` uses **`FileReader.readAsDataURL(file)`** to produce a
   base64 data URL (`fileToDataUrl` at line 122).
3. It posts to `POST /api/mobile-sessions/[token]/capture` with that `dataUrl`.
4. `recordMobileCapture` stores it in `MobileHandoffSession.capturedImages[angle].url`
   — **the full base64 string, in the server process's memory**.
5. The desktop tab polls the session and receives the data URLs, then submits them
   through the normal scan path.

**This is the only path where image bytes actually reach the server.** The
`MobileHandoffSession` type comment states it plainly: *"`url` is a data: URL — this
mock has no object storage, so the image travels as base64 through the same in-memory
session record as everything else."* Base64 inflates payloads by roughly 33%, and
several full-resolution phone photos per session sit in the Node heap until restart.

## 5.3 Path C — E-commerce scraping

The `UploadedImage` objects come from fixture data
(`src/lib/mock/ecommerce.ts`) and their `url` values are static paths under
`/images/`. **Nothing is fetched from any e-commerce site.** `toPipelineImages` maps
the first (hero) image to `front` and everything after it to `additional` — deliberately
not to `back` or `side_pdp`, because an e-commerce gallery's second image is not the
back of the pack and claiming otherwise would put a fabricated angle into the record.

## 5.4 Path D — Citizen grievance portal

1. The citizen selects a photo.
2. `photoQuality.ts` runs **real** analysis on a 96px downscale via canvas, entirely
   in the browser, and produces an advisory hint.
3. The photo is converted to a data URL and posted to `POST /api/grievances` as
   `photo: { fileName, url, sizeBytes }`.
4. The route enforces `sizeBytes ≤ 8 MB` **and** `url.length ≤ 16 MB` — the second
   check exists because base64 inflates the string and the declared size is
   client-supplied and therefore untrusted.
5. It becomes the `front` image on a `Citizen-Reported` pipeline run.

## 5.5 Placeholders

`buildFinalRecord` fills any missing angle with `/images/placeholder/<category-slug>.svg`,
`sizeBytes: 0`, and alt text that **says it is a placeholder** rather than describing a
photo that does not exist. Generated by `npm run placeholders`.

## 5.6 Every place an image reference lives in the data model

| Location | Field | Form |
|---|---|---|
| `ComplianceRecord.thumbnail` | `UploadedImage` | list thumbnail; the front image or a placeholder |
| `ComplianceRecord.capturedImages` | `UploadedImage[]` | exactly three: front, back, side_pdp |
| `ComplianceRecord.evidence[].image` | `UploadedImage` | modelled, always empty in practice |
| `MobileHandoffSession.capturedImages` | `Partial<Record<CaptureSlotAngle, UploadedImage>>` | **base64 data URLs in server memory** |
| `ScrapedListing.images` | `UploadedImage[]` | fixture static paths |
| `StoredPipelineRun.images` | `{ angle, fileName, url, sizeBytes }[]` | the pipeline's own input copy |
| `CaptureSlotState.image` | `UploadedImage` | client-only, transient |
| Grievance submission | `{ fileName, url, sizeBytes }` | data URL, in the request body |

**What a real implementation needs:** presigned-upload object storage, with
`UploadedImage.url` becoming a durable storage key or a signed retrieval URL. The
type does not need to change — only what fills it. Note the citizen path stores PII
alongside images and its retention policy is undefined.

---

# 6. Real-time and polling behaviour

Four polling loops. All are client-side `setInterval` against Route Handlers, all
poll unconditionally while mounted, and **none has backoff, jitter, or a cap on
attempts**. Backend sizing must assume every open tab sustains these rates.

| Loop | Interval | Endpoint | File |
|---|---|---|---|
| Processing Pipeline Tracker | **600 ms** | `GET /api/scan-pipelines/[scanId]` | `src/lib/hooks/useScanPipeline.ts:18` |
| Report generation run | **500 ms** | `GET /api/reports/runs/[runId]` | `src/lib/hooks/useReports.ts:31` |
| E-commerce batch queue | **800 ms** | `GET /api/ecommerce/batches/[batchId]` | `src/components/ecommerce/BatchView.tsx:15` |
| Mobile handoff session | **2500 ms** | `GET /api/mobile-sessions/[token]` | `src/lib/hooks/useMobileHandoffSession.ts:12` |

A fifth interval, `MobileHandoffPanel.tsx:65`, ticks every 1000 ms but is a purely
local countdown clock for the QR expiry display and makes no request.

**Why the fast three are so fast:** mocked stages last 300–900 ms, so a slower poll
would skip visible stages entirely. **With a real pipeline these intervals are wrong
and should be reconsidered as part of the same change** — real OCR takes seconds to
tens of seconds, and a 600 ms poll against it is roughly 100 wasted requests per
scan.

**Worst realistic load today:** an officer running a 20-listing bulk batch with the
batch view open and one tracker open in another tab sustains roughly 3 requests per
second from one person, each returning a full run object.

## Push-mechanism candidates

**Strong candidates, in order:**

1. **Mobile handoff (2500 ms)** — the strongest case. It polls for an event that may
   never come (a phone that never connects) over a session lasting up to five
   minutes, which is up to 120 requests to learn nothing. It is also the loop where
   latency is most visible to the user, since the desktop is meant to mirror captures
   as they happen. **SSE fits perfectly**: one-directional, server-to-client, short-lived.
2. **Pipeline tracker (600 ms)** — with real OCR the duration becomes unpredictable,
   which is exactly the case polling handles worst. **SSE** again, since the client
   never needs to push.
3. **E-commerce batch (800 ms)** — same shape as the tracker but fans out over N
   concurrent runs, so the saving multiplies.
4. **Report runs (500 ms)** — weakest case. Generation is fast and bounded, and
   rendering will stay server-local. Polling is defensible here.

**One property to preserve if you move to push.** Progress in all four is currently
**derived from stored timestamps on every read**, never from a live timer. The
pipeline store's doc comment explains why: a poll after a long gap fast-forwards
correctly through however many stages elapsed while the tab was closed, and there is
no `setTimeout` chain to survive a server restart. **Keep that property.** A push
implementation should still expose a "give me current state" read so a reconnecting
client resynchronises rather than waiting for the next event.

---

# 7. Known technical debt and open items

## 7.1 The flaky Playwright test

`tests/e2e/dashboard.spec.ts:47` — *"Compliance trend › the weekly/monthly toggle
switches pressed state"*, on the `mobile-390` project only.

**Observed at least three times** across separate sessions. It fails in a full
81-test run and passes both in isolation and on an immediate full re-run. **It has
never been isolated or fixed.** The suspicion is a race between the chart's animation
and the assertion on `aria-pressed`, but that is a hypothesis, not a diagnosis. It is
the only known-flaky test.

## 7.2 The 40px button default versus the 44px touch target

`--lmcs-touch-target: 44px` is declared in `src/styles/layout.css:27` as the
"A-09 / WCAG 2.5.5 floor" and is applied individually to specific controls (lines 119,
184-185, 217-218 and others). **It is not applied to buttons by default** — the UX4G
package's own default button height is 40px.

This has produced a recurring bug: each new page has needed its own touch-target
audit, and page 11 required explicit `min-height: var(--lmcs-touch-target)` on the
upload retry and upload buttons plus an `ux4g-btn-lg` on the lookup button. **A
single app-wide default would have prevented all of them.** It is deferred because
overriding the design system's button sizing globally needs a deliberate decision
about whether that is an acceptable divergence from UX4G.

## 7.3 Three independent `createPipelineRun` call sites

`createPipelineRun()` in `scan-pipeline-store.ts` is reached three ways, each
forwarding a different subset of its input:

| Caller | Forwards | Omits |
|---|---|---|
| `POST /api/scan-pipelines` (`src/app/api/scan-pipelines/route.ts:44`) | `scanId`, `metadata`, `images`, `scannedByUserId`, `forceFailStage`, `fallbackOverride` | **`source`, `batchId`, `citizenReport`, `qualityNote`** |
| `ecommerce-store.ts:139` | adds `source: "E-commerce-Sourced"`, `batchId` | — |
| `grievance-store.ts:172` | adds `source: "Citizen-Reported"`, `citizenReport`, `qualityNote` | — |

**The HTTP route is the weakest of the three.** It silently drops `source`, which is
precisely why pages 8 and 11 bypass it and call the store function directly from
their own server modules. Both files document the workaround. **A real backend should
consolidate these into one entry point that accepts the full input**, rather than
inheriting a route handler that cannot express two of the three intake paths.

## 7.4 The frozen repeat-violation threshold

`REPEAT_VIOLATION_THRESHOLD = { nonCompliantCount: 3, withinDays: 90 }` in
`src/types/manufacturer.ts`. Per BRD §9.5 and the permission matrix it is
**Admin-editable**, and `rules.manageThresholds` exists as a permission. **The Admin
Console that would edit it was never built**, so it is a compile-time constant. Any
change requires a deploy.

## 7.5 The region / Jurisdiction reconciliation — what was actually decided

**Jurisdiction was deferred, not implemented.** Verified against the code while
writing this document: there is no `Jurisdiction` type, no `jurisdictionId` field on
any type, and no admin route. The decisions actually taken:

1. **`User.region` stays a flat string.** No hierarchy, no parent/child relationships.
2. **`ActivityEvent.region` is denormalised, copied rather than joined.** The reasoning
   is recorded in `history.ts`: an event is a historical fact, and correcting a
   record's region later must not silently rewrite where past events are recorded as
   having happened. **A real backend should preserve this** — it is a deliberate
   design property of an audit log, not a normalisation oversight.
3. **Region stands in for jurisdiction in the Activity Log's filter**, because 13 §3.2
   asks for "region/jurisdiction" and only one of the two exists.
4. **Automatic jurisdiction scoping is not implemented and is a known gap.** 13 §4.2
   says visibility scopes by jurisdiction and a District Admin should presumably see
   only their district's events. **Today every Admin sees every region.** The Activity
   Log's own plan recorded this as an open question rather than silently deciding it.
5. **`case_reassigned` is declared but never emitted**, kept so the vocabulary matches
   the spec rather than quietly diverging.

**Still unresolved:** BRD §15 Q-05 — whether deployment is a central DoCA pilot or a
state-level rollout — which determines whether `region` should be Indian states (as
the mock data assumes) or something else entirely. This blocks a real jurisdiction
model and is flagged in both `scan.ts:208` and `src/lib/mock/reference.ts:8`.

## 7.6 Every remaining TODO in the code

| File and line | Item |
|---|---|
| `src/lib/api/auth.ts:11` | BRD §15 Q-06 unresolved — real auth may be Aadhaar-linked or departmental SSO. |
| `src/lib/mock/users.ts:9` | Same Q-06. |
| `src/types/scan.ts:21` | BRD §15 Q-04 unresolved — DoCA has stated no real upload size limit; 10 MB is a placeholder. |
| `src/types/scan.ts:208`, `src/lib/mock/reference.ts:8` | BRD §15 Q-05 unresolved — central versus state deployment. |
| `src/lib/mock/analytics.ts:12` | BRD §15 Q-07 unresolved — whether real manual-inspection baseline data exists to compare against. |
| `src/types/report.ts:208` | BRD §15 Q-08 unresolved — whether email, SMS or WhatsApp notification channels are required at launch. Typed, defaulted false. |
| `src/lib/server/scan-pipeline-store.ts:396` | The scan wizard has no product-name field, so `productName` is synthesized. |
| `src/providers/AuthProvider.tsx:142` | BRD A-11 / WCAG 2.2.1 — a session must warn before expiring. Not implemented. |
| `src/components/layout/Header.tsx:32` | Notification count sourced from dashboard alert fixtures. |
| `src/lib/constants/routes.ts:83` | The five statutory footer pages are routed and linked but not built. |

## 7.7 Other deferred items

- **13 §3.1's richer per-record timeline** was deliberately not built. The store
  records all seventeen event types; page 6 still shows the coarse seven. The
  reasoning: filling an already-shipped tab with pipeline noise in the same change
  that rewrote ten write paths is "two changes wearing one coat".
- **"Searchable" in the Activity Log** — 13 §3.2 says "filterable, searchable". Four
  filters shipped; free-text search did not, because nothing specifies what it would
  search over.
- **`ACTIVITY_LOG_DEFAULT_WINDOW_THRESHOLD = 2000`** is declared and unused, naming
  the volume at which a default date window becomes necessary.
- **Manufacturer name-variation matching** (BRD R-02) is out of scope; matching is
  exact string comparison and the UI says so.
- **XLSX report format** was deliberately removed rather than left typed but
  unproducible.
- **Tagged PDF output** — `pdfIsTagged` is always `false` because jsPDF emits no
  `/StructTreeRoot`. Reported honestly so the UI can warn rather than link an
  untagged document silently. This is an A-12 / WCAG 1.3.1 gap.

---

# 8. What is already production-real and must not be re-architected

Three things in this codebase are genuinely implemented. Rebuilding them would waste
effort and would likely produce something worse, because each embodies a decision
that took deliberation.

## 8.1 PDF and DOCX report generation — fully real

**Files:** `src/lib/server/report-render.ts` (438 lines),
`GET /api/reports/[id]/download/[format]`.
**Libraries:** `jspdf@4.2.1`, `docx@9.7.1`, `qrcode@1.5.4`.

This produces **genuine, valid files**, confirmed opening in Acrobat and Word. Not a
fake blob, not a data URL with a PDF extension. Specifics worth preserving:

- **A4 portrait at 595×842 points** with a 48pt margin and 15pt line height,
  paginated properly rather than overflowing.
- **Real government document furniture** — Department of Consumer Affairs, Ministry of
  Consumer Affairs Food & Public Distribution, Government of India.
- **A real QR code**, generated with `QRCode.toDataURL()` and embedded, encoding the
  report's `verifyUrl` so a printed report resolves back to its Download History
  entry (13 §2).
- **One document assembly, three renderers.** `buildReportDocument()` produces a
  `ReportDocument`; the preview, the PDF and the DOCX all read it. **The preview
  cannot drift from what downloads** — this is the architectural property to keep.
- **Honest attribution.** The three-variant `ReportAttribution` distinguishes a
  verifier from a compiler from an unverified record. A multi-record report names the
  compiler and each record carries its own verifier line, because presenting the
  compiler as verifier would be wrong on a document that may enter an enforcement file.
- **Honest accessibility reporting.** `pdfIsTagged: false` is returned rather than
  quietly linking an untagged document.
- **Re-render from scope, never store the file.** No file store, no expiry policy, no
  dead links. The trade-off is documented in the route.

**The one thing to reconsider:** if reports are ever legal evidence, "re-render from
current data" is wrong and you need immutable stored artefacts. That is a
requirements decision, not a defect. Everything else here should carry over.

## 8.2 The central audit store and `emitActivityEvent()` write path

**File:** `src/lib/server/audit-store.ts` (407 lines). **Commits:** `f7ef9d3` (write
path), `ee639f4` (query surface).

The storage is in-memory and must be replaced. **The design must not be.** It was the
highest-regression-risk change in the build, deliberately split across two sessions,
and it resolved a real mess: before it, eight write sites each shaped events inline
and pushed directly onto `record.auditTrail`, and three mutations — archiving, Retry
OCR, and clearing a Needs Review flag — **wrote nothing at all**.

Properties to preserve:

- **One write path.** Every mutation calls `emitActivityEvent(input, record?)` and
  nothing else. There is no other way to write an event.
- **One source, two projections.** The rich `ActivityEvent` is the source of truth;
  the coarse `AuditEvent[]` on the record is a maintained projection refreshed in the
  same call. `record.auditTrail` was kept rather than removed because it has three
  readers and only one is display — the PDF renderer derives the verifying officer
  from it, and the citizen status lookup derives "Under Review" from it.
- **`ACTIVITY_TO_AUDIT_TYPE` is a total map**, so a new event type cannot be added
  without deciding whether it appears in the per-record timeline.
- **Denormalised region**, copied not joined, for the reason in section 7.5.
- **Monotonic ids** (`act-000001`) usable as a sort tie-breaker.
- **Seed history synthesized at first read**, so fixture records do not render as
  broken empty timelines.
- **32 unit tests** cover ordering, id uniqueness, actor handling, projection
  filtering, the seed backfill, and the full query surface.

## 8.3 The mobile session / QR handoff model

**File:** `src/lib/server/mobile-session-store.ts`. **Storage is in-memory; the model
is sound.**

- **Single-use** — `connectMobileSession` transitions `waiting → connected` and returns
  `undefined` for any other state, so a token cannot be joined twice.
- **Expiring** — a 5-minute TTL, with expiry **derived from `expiresAt` on every read**
  rather than by a timer, so it survives a restart and cannot leak a live session.
- **Scoped** — every session carries a `scanDraftId` binding it to one in-progress scan.
- **Unambiguous tokens** — `generateHandoffCode()` uses a character set with no
  visually confusable characters, because a human may read the code aloud or type it.
  The same generator backs citizen grievance references.
- **Indistinguishable failure** — connect returns one message for not-found, expired
  and already-used, so the endpoint cannot be probed for valid tokens.

**Carry this model directly into a persistent implementation.** Replace the `Map` with
a table or a Redis key with a real TTL; keep single-use, keep derived expiry, keep the
scan-draft scoping, keep the token alphabet, keep the indistinguishable failure.

## 8.4 Also real, lower profile

- **The citizen photo quality check** (`src/lib/utils/photoQuality.ts`) — genuine
  canvas-based luminance and Laplacian-variance analysis on a 96px downscale, running
  entirely in the browser with no dependency. Handles a tainted canvas and an
  unreadable file by raising no hint rather than a false one.
- **Record filtering, sorting and pagination** (`listRecords`) — a real
  filter/sort/slice implementation. Only its data source is fake.
- **Analytics and scorecard aggregation** — real computation over whatever records
  exist, including live ones.
- **The URL-as-filter-state convention** — every filter surface carries state in the
  URL with repeated keys, so any filtered view is a shareable link. Consistent across
  pages 5, 7, 9 and the Activity Log.

---

# 9. Hardcoded configuration values

Every value below should become real configuration. Grouped by what a deployment
would need to tune.

## 9.1 Already environment-driven

| Variable | Default | Where |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCK_DATA` | mock unless the literal string `"false"` | `src/lib/api/client.ts:13`, `src/lib/api/auth.ts:35` |
| `NEXT_PUBLIC_API_BASE_URL` | `""` | `src/lib/api/client.ts:12`, `src/lib/api/auth.ts:36` |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | 10 | referenced by `DEFAULT_MAX_UPLOAD_MB`, `src/types/scan.ts:26` |

**Note the fail-open default:** mock mode is on unless explicitly disabled. A
production deployment that forgets the variable runs entirely on fixtures.

## 9.2 Upload and file limits

| Constant | Value | File |
|---|---|---|
| `DEFAULT_MAX_UPLOAD_MB` | **10 MB** | `src/types/scan.ts:26` — placeholder; BRD §15 Q-04 unresolved. **User-visible**, shown in the UI before a bad attempt. |
| `MAX_PHOTO_BYTES` | **8 MB** | `src/lib/server/grievance-store.ts` — plus a derived `url.length ≤ 16 MB` cap on the base64 string. |
| `ACCEPTED_UPLOAD_FORMATS` | `JPG`, `JPEG`, `PNG`, `PDF` | `src/types/scan.ts:16` |

**These two limits disagree (10 MB versus 8 MB) and should be reconciled.**

## 9.3 Session and token lifetimes

| Constant | Value | File |
|---|---|---|
| `SESSION_TTL_MINUTES` (mobile handoff) | **5 minutes** | `src/lib/server/mobile-session-store.ts:29` |
| `MOCK_SESSION_MINUTES` (user session) | **30 minutes** | `src/lib/api/auth.ts:39` — comment says the real value comes from the backend |

## 9.4 Rate limiting

| Constant | Value | File |
|---|---|---|
| `MAX_SUBMISSIONS_PER_WINDOW` | **5** | `src/lib/server/grievance-store.ts` |
| `WINDOW_MS` | **1 hour** | same |

**This is the only rate limit anywhere in the application.** Every other endpoint,
including every mutation, is unthrottled.

## 9.5 Compliance scoring and rule thresholds

| Constant | Value | File |
|---|---|---|
| Compliance score band cutoffs | **Excellent ≥ 90, Good ≥ 70, Poor ≥ 40, Critical below** | `complianceScoreBand()`, `src/types/compliance.ts` |
| Confidence band cutoffs | **High ≥ 90, Medium 70–89, Low < 70** | `confidenceBand()`, `src/types/vocabulary.ts` |
| `REPEAT_VIOLATION_THRESHOLD.nonCompliantCount` | **3** | `src/types/manufacturer.ts` |
| `REPEAT_VIOLATION_THRESHOLD.withinDays` | **90** | same |
| Rule 7 required numeral height | **4 mm**, or **6 mm** embossed | encoded in fixture strings, not a constant |

**The Rule 7 heights are not extracted into a constant anywhere** — they exist only in
the `FontSizeCheck` type's doc comment and in fixture detail strings. A real rule
engine must define them properly.

## 9.6 The OCR fallback threshold — does not exist

**Section 4's P1 gap has a configuration consequence worth stating separately.** There
is **no constant defining the OCR confidence threshold that triggers the Gemini
fallback.** The mock decides which single field needs fallback at seed time by
hardcoding the field id (`countryOfOrigin`), and assigns it a confidence of `82`
after the fact. A real pipeline needs this as a first-class tunable, and the 82/92
numbers in `seedDeclarations` are not it — they are outputs chosen to look plausible
against the 90/70 band cutoffs.

## 9.7 Timing and pagination

| Constant | Value | File |
|---|---|---|
| Pipeline `STAGE_DURATION_MS` | uploading 500, qualityCheck 0, textExtraction 900, fallbackExtraction 700, structuring 700, ruleEngine 600, complianceScore 300, readyForVerification 0 | `src/lib/server/scan-pipeline-store.ts` |
| Report `STAGE_DURATION_MS` | collecting 600, rendering 1100, finalising 400 | `src/lib/server/report-store.ts:51` |
| `MAX_SCOPE_ROWS` | **1000** | `src/lib/server/report-store.ts:64` |
| `MAX_BODY_RECORDS` | **100** | `src/lib/server/report-render.ts:60` |
| `LARGE_REPORT_ROW_THRESHOLD` | **100** | `src/types/report.ts` |
| `ACTIVITY_LOG_DEFAULT_WINDOW_THRESHOLD` | **2000** | `src/types/history.ts` — declared, unused |
| Default page size (records, activity) | **20** | route handlers |
| Poll intervals | 600 / 500 / 800 / 2500 ms | section 6 |

## 9.8 Document metadata

`DEPARTMENT`, `MINISTRY` and `GOVERNMENT` are hardcoded strings in
`src/lib/server/report-render.ts:62-64`. Page geometry (`PAGE_MARGIN` 48,
`PAGE_WIDTH` 595, `PAGE_HEIGHT` 842, `LINE` 15) at lines 200-203.

## 9.9 Credentials — must not survive to production

`MOCK_CREDENTIALS` in `src/lib/mock/users.ts:60-62`: three usernames
(`r.deshmukh`, `s.iyer`, `a.banerjee`) sharing the plaintext password
**`Demo@2026`**, and **the login page displays them on screen**.

---

# 10. Test and verification tooling

The frontend held a consistent bar throughout. **Backend work should meet it rather
than shipping with lower rigour.**

## 10.1 `npm run verify` — the gate

Four sequential checks, any failure stopping the chain:

```
npm run verify:tokens:check && npm run i18n:check && npm run typecheck && npm run lint
```

1. **`verify:tokens:check`** (`scripts/verify-tokens.mjs`) — verifies `tokens.css`
   matches the installed `ux4g-web-components@2.0.1`, and that **every `--ux4g-*`
   custom property and `ux4g-*` class referenced anywhere in `src/` actually exists in
   the installed package** (currently 1314 tokens and 5264 classes). This exists
   because the design system's example files disagree with its compiled stylesheet,
   and invented class names fail silently in the browser. It has caught real bugs.
2. **`i18n:check`** (`scripts/sync-locales.mjs --check`) — asserts `hi.json` is
   structurally in step with `en.json`. Currently reports 943 untranslated keys, which
   is expected; the check is about **structure**, not translation coverage. Adding an
   English key without running `npm run i18n:sync` fails the build.
3. **`typecheck`** — `tsc --noEmit`, strict, with `exactOptionalPropertyTypes: true`.
   That last flag is stricter than most projects: `{ dateFrom: undefined }` is a type
   error where the key is optional; the key must be absent. It has caught real bugs
   and shapes how optional fields are constructed throughout.
4. **`lint`** — `eslint . --max-warnings=0`, including `eslint-plugin-jsx-a11y` and
   `eslint-config-next`. **Zero warnings tolerated.** The `react-hooks/set-state-in-effect`
   rule in particular caught the same class of bug three separate times.

## 10.2 Unit tests — `npx vitest run`

**67 tests across 4 files**, all passing.

| File | Tests | Covers |
|---|---|---|
| `tests/unit/audit-store.test.ts` | 32 | Event ordering, id uniqueness and monotonicity, actor handling including the system and citizen sentinels, the coarse projection's filtering, the seed backfill, and the full query surface — each filter dimension independently and combined, date-range boundaries, pagination totals, and that an empty-string region survives. |
| `tests/unit/vocabulary.test.ts` | 16 | Every fixed vocabulary value has a label in **both** message catalogues; the taxonomy is internally consistent. |
| `tests/unit/mock-data.test.ts` | 12 | Fixture data obeys the rules it illustrates — computed compliance status matches stored status, KPI counts match the underlying records, the repeat-violation flag matches the threshold, and every record has a scan-id label including archived ones. |
| `tests/unit/format.test.ts` | 7 | Date and number formatting helpers. |

The `mock-data` suite embodies a principle worth carrying over: **fixture data that
disagrees with the rules it illustrates is worse than no fixture data**, because it
teaches the wrong shape and a judge can catch it by clicking.

## 10.3 End-to-end tests — `npx playwright test`

**81 tests: 80 passing, 1 skipped.** Every spec runs against **three viewport
projects** — `mobile-390` (390×844), `tablet-1024` (1024×1366) and `desktop-1440`
(1440×900) — chosen by pixel range rather than device name because those are the
breakpoints the layout actually splits on.

| Spec | Tests | Covers |
|---|---|---|
| `tests/e2e/login.spec.ts` | 8 | All seven login states plus the route-guard round trip with `?next=`. |
| `tests/e2e/dashboard.spec.ts` | 12 | KPI cards, the trend toggle actually swapping the rendered series, the eight-row Recent Scans cap, alert deep links, role-gated quick actions, and independent per-widget loading/error/empty states. |
| `tests/e2e/shell.spec.ts` | 5 | **The Role Permission Matrix as it actually renders** — exact nav counts per role (Enforcement Officer 7, Admin 8, Reviewer 6), that a Reviewer loses exactly the two scan-creating entries and gains the Activity Log, header role badge, and sign-out clearing the session. |

**Known flaky:** `dashboard.spec.ts:47` on `mobile-390` only. See section 7.1.

## 10.4 Other tooling

- **`npm run qa:visual`** (`scripts/visual-qa.mjs`) — the visual QA loop.
- **`npm run placeholders`** — regenerates the per-category placeholder SVGs.
- **`npm run format` / `format:check`** — Prettier.
- **`npm run i18n:sync`** — propagates new English keys into `hi.json` as untranslated
  placeholders. **Must be run after adding any message key.**

## 10.5 The bar backend work should meet

1. **Every new route handler gets contract tests** asserting the exact success shape
   and **every** error status, in the manner section 3 documents them. The frontend
   branches on specific status codes and on 200-with-a-named-failure bodies; a shape
   change breaks it silently.
2. **Preserve the 200-with-named-failure pattern** where it exists. Turning
   `blockedFields` or a scrape `failure` into an HTTP error changes what the user sees
   from a precise explanation to a generic failure.
3. **New vocabulary values need message-catalogue entries in both languages**, and the
   `vocabulary` suite asserts it.
4. **Fixture and seed data must obey its own rules**, as `mock-data.test.ts` asserts.
5. **`npm run verify` must stay green.** It is the gate every commit in this repo has
   passed.

---

# 11. Recommended backend architecture

Everything above is documentation. This section is a recommendation, offered because
the brief asks for one, and it should be argued with rather than followed blindly.

## 11.1 Database: PostgreSQL

**Recommendation: PostgreSQL**, not a document store.

The type definitions in section 2 are relational in shape and the aggregation
workload is relational in nature. Concretely: the manufacturer scorecard groups
records by manufacturer and windows them over 90 days; analytics produces four
independent breakdowns over the same record set; the Activity Log filters across
records by four dimensions with pagination. All of that is SQL's home ground and
awkward in a document store. Two further reasons: `ActivityEvent` is an
append-only log that wants a real index on `(created_at, id)`, and `JSONB` gives you
the escape hatch for the genuinely document-shaped parts without giving up joins.

### Suggested schema shape

```
users(id, username UNIQUE, full_name, email, role, department, region,
      password_hash, last_login_at, created_at, disabled_at)

-- region is a plain string today. See 11.1.1 before adding a jurisdictions table.

compliance_records(
  id, scan_id UNIQUE, product_name, manufacturer_id FK, category, region, source,
  verification_status, compliance_status, needs_review_flag,
  needs_review_by_user_id FK NULL, needs_review_note NULL,
  flagged_for_enforcement, compliance_score_value NULL, compliance_score_band NULL,
  ecommerce_listing_url NULL, batch_id FK NULL,
  scanned_at, last_updated_at, archived,
  created_by_user_id FK
)

manufacturers(id, name, normalized_name, created_at)
-- normalized_name exists for the name-variation matching BRD R-02 defers.
-- Keep exact matching as the shipped behaviour; add fuzzy matching behind a flag.

declarations(
  id, record_id FK, field_id, value NULL, not_detected, confidence, band,
  corrected, corrected_by_user_id FK NULL,
  source_engine, source_image_angle, created_at
)

checklist_lines(id, record_id FK, field_id, passed, value NULL,
                violation_category_id NULL, detail NULL)
-- Note field_id here is a DeclarationFieldId OR the literal 'fontSize'.

font_size_checks(id, record_id FK, field_id, measured_height_mm,
                 required_height_mm, embossed, passed)

images(id, record_id FK NULL, session_id FK NULL, angle, file_name,
       storage_key, size_bytes, content_type, alt_text, uploaded_at)
-- storage_key replaces the current url. See 11.4.

evidence(id, record_id FK, image_id FK, caption, attached_at, attached_by_user_id FK)

activity_events(
  id BIGSERIAL, record_id FK, type, actor_user_id FK NULL, actor_role NULL,
  detail NULL, field_id NULL, old_value NULL, new_value NULL,
  region NULL,            -- denormalised deliberately; see 7.5
  created_at
)
-- INDEX (created_at DESC, id DESC), (record_id, created_at), (actor_user_id),
--       (type), (region)
-- Append-only. Revoke UPDATE and DELETE at the role level.

pipeline_runs(id, scan_id UNIQUE, record_id FK, status, source, batch_id FK NULL,
              metadata JSONB, created_by_user_id FK, created_at, completed_at NULL)
pipeline_stages(id, run_id FK, stage_id, state, summary NULL,
                failure_reason NULL, started_at NULL, completed_at NULL)

mobile_sessions(token PK, scan_draft_id, status, created_at, expires_at,
                connected_at NULL, created_by_user_id FK)
-- Or Redis with a native TTL; see 11.4.

grievances(reference PK, record_id FK NULL, submitted_at,
           submitter_name NULL, submitter_contact NULL, retention_expires_at)
-- PII lives ONLY here. See 11.5.

reports(id, name, scope JSONB, formats TEXT[], generated_at,
        generated_by_user_id FK, reference_code UNIQUE, row_count)

ecommerce_batches(id, source_url, metadata JSONB, created_at, created_by_user_id FK)
ecommerce_listings(id, batch_id FK, listing_url, title, description_excerpt,
                   status, failure_reason NULL, record_id FK NULL)
```

**Use `JSONB` for exactly three things** — `pipeline_runs.metadata`,
`reports.scope` and `ecommerce_batches.metadata` — because all three are genuinely
schemaless payloads the application round-trips without querying into. Everything else
gets real columns.

**Store the fixed vocabularies as `CHECK` constraints or Postgres enums**, not free
text. They are a terminology contract and the frontend asserts them.

### 11.1.1 On jurisdictions

**Do not build the jurisdiction hierarchy yet.** BRD §15 Q-05 is unresolved and
determines whether `region` means Indian states or something else. Keep `region` as a
string, add a `jurisdictions` table when the question is answered, and migrate. **Do
not backfill `activity_events.region` from a join when you do** — those values are
historical facts and the denormalisation is deliberate.

## 11.2 The OCR / LLM / rule-engine pipeline: a separate service

**Recommendation: a separate Python service, invoked asynchronously through a queue.
Do not call PaddleOCR or Gemini from Next.js API routes.**

Four reasons:

1. **PaddleOCR is Python.** Every sane binding, model artefact and preprocessing tool
   is in that ecosystem. Shelling out from Node is the worst of both worlds.
2. **The workload profile is wrong for a request handler.** OCR is CPU or GPU bound
   and takes seconds to tens of seconds. Next.js API routes are I/O-bound request
   handlers, and a serverless deployment will time out.
3. **Independent scaling.** Scan volume and page-view volume have no relationship.
4. **The frontend is already shaped for it.** The pipeline is already asynchronous —
   create a run, poll for progress, get a record at the end. **That contract does not
   change.** Only what happens between stages becomes real.

### Suggested shape

```
Next.js  --POST /api/scan-pipelines-->  API layer
                                          |
                                          +-- writes pipeline_runs + stages (all pending)
                                          +-- enqueues a job
                                          |
                                     [ queue ]
                                          |
                              Python pipeline worker
                                 |
                                 +-- 1. fetch images from object storage
                                 +-- 2. quality inspection  -> stage: qualityCheck
                                 +-- 3. PaddleOCR per image  -> stage: textExtraction
                                 +-- 4. per-field confidence < THRESHOLD?
                                 |        -> Gemini fallback  -> stage: fallbackExtraction
                                 |        -> else mark SKIPPED (never silently omit)
                                 +-- 5. LLM structuring       -> stage: structuring
                                 +-- 6. rule engine (6/7/8/9) -> stage: ruleEngine
                                 +-- 7. compliance score      -> stage: complianceScore
                                 +-- 8. build record          -> stage: readyForVerification
                                 |
                                 writes stage transitions + activity events as it goes
```

**Rules that fall out of the existing design and should be honoured:**

- **Keep all eight stage ids and all five states.** `skipped` must stay a real
  outcome — the frontend renders "fallback not needed" distinctly from "fallback
  succeeded", and that honesty was a deliberate spec requirement.
- **Keep progress readable at any moment.** A reconnecting client must be able to ask
  for current state, not wait for the next event.
- **Keep stage-scoped retry.** Retrying `ruleEngine` must not re-run OCR. This becomes
  *more* valuable with a real pipeline, where re-running OCR is expensive.
- **Make retry able to fail.** Today it always succeeds, which is the mock's biggest
  behavioural lie after the quality gate.
- **The rule engine should be a separate, independently testable module**, not
  embedded in the OCR worker. It is pure logic over structured input, it is the part
  most likely to change as legal interpretation is refined, and it is the part that
  most needs a test suite of known-good labels with known verdicts.

**The quality gate is the exception to "separate service".** It must give a verdict
*before* the officer leaves the capture screen, so a second or two of latency is the
budget. Either run a lightweight synchronous check at the API layer, or keep it
client-side and have the worker re-verify. **Do not defer it into the async pipeline**
— that would let a bad photograph through the capture step, which defeats the point.

## 11.3 Authentication: server-side sessions, not JWTs

**Recommendation: opaque session tokens in HttpOnly, Secure, SameSite=Strict cookies,
with server-side session records.**

BRD §15 Q-06 is unresolved (Aadhaar-linked, departmental SSO, or credentials), so
design the session layer to be independent of how identity is *established*. Whichever
answer arrives, it terminates in "create a session for this user".

**Why sessions rather than JWTs, specifically here:**

1. **Revocation matters.** This is a government enforcement system where accounts get
   disabled and roles change. A stateless JWT stays valid until expiry; you cannot
   un-issue it. Refresh-token dances exist to work around this and reintroduce server
   state anyway.
2. **Role and jurisdiction claims must not go stale.** An Admin demoted to Reviewer
   should lose the Activity Log immediately, not in fifteen minutes.
3. **The claims will grow.** Jurisdiction scoping is coming (7.5) and will make the
   claim set larger and more mutable — exactly the wrong thing to embed in a token
   sent on every request.
4. **You are already doing a database round trip.** The stateless argument buys little.

### How role and jurisdiction travel

**They do not travel from the client. Ever.** The cookie carries an opaque session id;
the server loads the session, resolves role and jurisdiction from `users`, and
authorizes from that. This preserves the resolution already recorded against BRD §15
Q-01 — *role is assigned server-side from credentials, and the client never chooses
its own permissions*.

**Then delete the `userId` field from every mutation request body.** Section 3 shows
sixteen endpoints accepting an unvalidated actor id. Every one of them should take the
actor from the session instead. **This is the single highest-value change in the
entire backend effort** — until it lands, the audit log is unfalsifiable in the wrong
direction: anyone can attribute any action to anyone.

**Port `ROLE_PERMISSIONS` verbatim** from `src/types/user.ts` to the server and
authorize against it there. Keep the frontend copy for UI gating; treat it as a
convenience, never as the decision.

**Suggested defaults:** 30-minute idle expiry matching the current mock, sliding
renewal, absolute cap around 8 hours, and implement the pre-expiry warning that
`AuthProvider.tsx:142` still records as a TODO.

**One consequence to plan for:** `RequireAuth` reads `sessionStorage` and
`src/proxy.ts` is locale-only precisely because middleware cannot read it. Moving to
cookies **lets middleware do real route protection**, which is strictly better and is
a small, well-understood frontend change.

## 11.4 Object storage

**Recommendation: S3-compatible storage with presigned uploads. Client uploads
directly; the API only ever handles keys.**

Section 5 shows three different fake mechanisms — blob URLs that never leave the
browser, base64 data URLs sitting in the Node heap, and static fixture paths.
Replacing them with one mechanism:

1. Client requests a presigned PUT for a declared content type and size.
2. Client uploads the bytes directly to storage.
3. Client sends the returned key to the API.
4. `images.storage_key` holds it; reads are served through short-lived presigned GETs.

**`UploadedImage` does not need to change** — only what fills its `url`. Serve
presigned GET URLs into that field and the frontend works unmodified.

**Do this before the OCR work**, because the pipeline worker needs to fetch images
from somewhere, and today there is nowhere for it to fetch them from. **This is
genuinely blocking.**

Keep the placeholder behaviour: when an angle was never captured, keep the explicit
placeholder whose alt text *says* it is a placeholder. That honesty was deliberate.

**Mobile sessions can move to Redis** with a native TTL. If you do, keep every
property in section 8.3 — single-use, derived expiry, scan-draft scoping, the
unambiguous alphabet, and indistinguishable failure.

## 11.5 A note on citizen PII

`grievances` is the only table holding personal data, and it does so deliberately —
name and contact are kept out of `ComplianceRecord` because that record is served by
the broadly-readable `/api/records`. **Preserve that boundary.** Add what the current
implementation lacks: a retention policy with a real expiry, encryption at rest,
access logging on reads of those two columns, and a defined answer for what happens to
a grievance's photograph after the case closes. **None of that exists today and none
of it is specified.**

## 11.6 Suggested build order

Mirroring the frontend's page-by-page discipline: each phase ends with something
demonstrably working, and the PS's core technical ask comes before anything
hierarchy-related.

### Phase 0 — Foundations *(nothing works without these)*
1. **PostgreSQL schema and migrations**, per 11.1.
2. **Object storage with presigned uploads**, per 11.4. Genuinely blocking for OCR.
3. **Port the seed data** so the app stays demoable throughout.
4. **Contract tests for the existing API shapes** in section 3, before changing any of
   them. This is your regression net.

### Phase 1 — The core technical ask *(the PS's actual subject)*
5. **The officer-facing quality gate.** Section 4's P0. First because it is the most
   dangerous gap, it is small, and it precedes everything downstream.
6. **The OCR pipeline as a separate service.** PaddleOCR primary, a real confidence
   threshold, genuine Gemini fallback, real per-field provenance. Wire it behind the
   unchanged pipeline contract.
7. **The LLM structuring step.**
8. **The rule engine as an independently testable module.** Rules 6, 7 and 8/9 — including
   real numeral-height measurement, and 8/9 which are currently never evaluated at all.
   Build it with a corpus of known labels and known verdicts.
9. **Make retries able to fail**, in all three retry paths.

**At the end of Phase 1 the product's headline claim is true.** Everything before this
is plumbing and everything after is administration.

### Phase 2 — Making it trustworthy
10. **Server-side sessions**, per 11.3.
11. **Remove `userId` from every mutation body**; take the actor from the session.
12. **Enforce `ROLE_PERMISSIONS` server-side on every endpoint.** Start with
    `/api/activity`, which currently serves the complete audit log to anyone.
13. **Real rate limiting**, replacing the demo-grade grievance guard and covering
    everything else.
14. **PII retention and encryption** for grievance submitter data.

### Phase 3 — Durability and scale
15. **Persist the audit log** with the append-only guarantees of 11.1, preserving the
    single-write-path design of 8.2.
16. **Real e-commerce scraping**, with the rate-limiting and blocking realities of BRD R-03.
17. **Reconsider the polling intervals** against real pipeline durations, then move
    mobile handoff and the pipeline tracker to SSE, per section 6.
18. **Anomaly detection**, replacing the fixture alerts.

### Phase 4 — Administration *(deliberately last)*
19. **Resolve BRD §15 Q-05**, then build the jurisdiction model.
20. **Jurisdiction-scoped visibility**, closing the gap in 7.5.
21. **The Admin Console** — user management, case reassignment (finally emitting
    `case_reassigned`), and the Rule Thresholds UI that unfreezes
    `REPEAT_VIOLATION_THRESHOLD`.
22. **The five statutory footer pages**, which are linked and 404 today.

### Throughout
- **Keep `npm run verify` green.**
- **Add contract tests with every endpoint**, not after.
- **When you replace a mock, delete it** rather than leaving a dead branch. The
  `isMockMode()` gate is useful during transition and becomes a liability once a real
  backend exists — particularly given it currently **fails open to mock mode**.

---

## Appendix — Quick file reference

| Concern | File |
|---|---|
| All domain types | `src/types/` (barrel: `index.ts`) |
| Role Permission Matrix (code) | `src/types/user.ts` |
| Role Permission Matrix (spec) | `Pages_Userflow/00-README.md` §C |
| Route paths and sidebar nav | `src/lib/constants/routes.ts` |
| API route handlers | `src/app/api/**/route.ts` |
| In-memory stores | `src/lib/server/*.ts` |
| Client API layer with mock gate | `src/lib/api/*.ts` |
| Mock fixture data | `src/lib/mock/*.ts` |
| Real PDF/DOCX rendering | `src/lib/server/report-render.ts` |
| Real citizen photo analysis | `src/lib/utils/photoQuality.ts` |
| Mocked officer quality gate | `src/lib/api/scans.ts:119` |
| Mocked OCR and rule engine | `src/lib/server/scan-pipeline-store.ts:174` |
| Central audit write path | `src/lib/server/audit-store.ts` |
| Mock credentials | `src/lib/mock/users.ts:60` |
| Verification scripts | `scripts/verify-tokens.mjs`, `scripts/sync-locales.mjs` |
| Tests | `tests/unit/`, `tests/e2e/` |
| Page specifications | `Pages_Userflow/*.md` |
| Design system contract | `docs/Design.md`, `.claude/skills/ux4g-design/` |
