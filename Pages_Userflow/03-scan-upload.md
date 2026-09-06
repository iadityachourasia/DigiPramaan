# Page 3 — Scan Capture Wizard

> See `00-README.md` for the Status Model, Role Permission Matrix, and Fixed
> Vocabulary this file assumes. **This revision fully replaces the previous
> version of this file.** The old single-upload-area design (one drag-drop
> zone, 5 generic upload states, no distinction between camera angles) is
> retired. Do not build the old version — everything below is current.
>
> For history/audit trail and hierarchical (jurisdiction) management, see
> `13-history-and-hierarchy.md` — those are cross-cutting concerns touching
> multiple pages, not part of this page's own scope.

## 1. Purpose & Why It Matters

This is the entry point for the PS's core functionality: "scanning packaged
commodity labels, product images and product information." Field officers
are the primary users, and field conditions are messy — poor lighting, one
hand holding a phone, a product that needs turning to see its declarations,
patchy connectivity. Unlike a generic file-upload page, this flow has to
account for three real constraints: a product's mandatory declarations are
often split across multiple faces of the pack, a photo taken under field
conditions is frequently unusable and shouldn't be wasted on OCR, and the
officer may be at a desktop with the product in front of them rather than
holding their capture device.

**Note on scope**: this page is for scans that start from a **physical
photo**. If a scan should start from an online listing instead, with no
physical photo at all, use the dedicated E-commerce Listing Scanner (page 8)
— this page's optional e-commerce URL field is only for noting that a
physically-photographed product is *also* listed online.

## 2. Sections & Fields

### Step 0 — Capture Mode Select

Three cards, not a dropdown — this is the first decision in the flow and
should be visually prominent, not buried as a form control:

| Mode | When an officer picks it |
|---|---|
| **Upload from device** | Desktop/laptop with existing photos, or a phone being used directly as the browser device |
| **Use this device's camera** | Phone or tablet, browser has camera access, officer photographs live |
| **Continue on mobile** | Officer is at a desktop/laptop but the product is in front of them, not the computer — hand capture off to their phone |

Selecting "Continue on mobile" does not navigate away — it opens a panel in
place, described under Mobile Handoff below.

### Steps 1–3 — Front / Back / Side(PDP) Capture

Three named slots, always visible together (not three separate full-screen
steps), so the officer sees at a glance what's still missing:

| Slot | What it must show |
|---|---|
| **Front** | The face customers see on shelf — usually brand name, generic name, net quantity |
| **Back** | Ingredients/composition panel — usually manufacturer details, consumer care |
| **Side — Principal Display Panel** | Whichever face actually carries the mandatory declaration cluster, when it differs from Front — common on cylindrical/irregular packs where the PDP wraps or sits on a side face |

Each slot, independently:
1. Starts empty with a placeholder icon + label
2. Accepts an image via whichever Step-0 mode was chosen
3. Runs through the Image Quality Inspection Layer (below) before being
   marked filled
4. Shows a thumbnail once accepted, with Retake/Remove
5. Is independently retriable — rejecting the Back image never discards an
   already-accepted Front image

The wizard cannot advance until all three slots are filled and passed. A
fourth **optional** "Additional angle" slot may be offered for edge cases
(e.g. an export-only fourth panel) but is never required.

### Mobile Handoff Panel

Shown in place of the three-slot grid when "Continue on mobile" is chosen,
until a phone connects:

- QR code encoding a one-time, short-lived session URL
- Plain-text fallback code below the QR, for typing into a browser manually
- Live status text: "Waiting for phone to connect…" → "Phone connected —
  waiting for photos…" → per-image confirmation as each lands, mirroring
  into the three-slot grid live as the phone captures each angle
- Visible expiry countdown, with a "Generate new code" action once expired
- Cancel action, invalidating the session immediately

### Mobile Capture Companion (separate route, no sidebar shell)

The page a phone lands on after scanning the QR. Minimal, camera-first:
- Session/product context confirmation ("Capturing for: [product context or
  scan ID] — connected")
- The same three named slots (Front/Back/Side-PDP), one emphasized at a time
  as the "next" one to capture
- Camera capture control, large touch target, no unrelated chrome
- Confirmation per photo taken, with the same Retake option
- A clear "All three captured — you can close this page" end state

### Image Quality Inspection Layer

Runs on every individual image immediately after capture/upload, gating
that slot before it's marked filled — a gate per image, not a gate on the
whole scan.

| Check | Rejects when |
|---|---|
| Blur | Sharpness score below threshold |
| Distortion / skew | Perspective distortion severe enough that text geometry is unreliable |
| Curvature | Label wraps a curved surface (bottle/jar) badly enough OCR would misread it |
| Text visibility | No detectable text region, or coverage far below what a label should show |

- Runs synchronously with a brief "Checking image quality…" state — near-
  instant, not a multi-second wait, since it gates each of three photos.
- On fail: the image is rejected **and deleted server-side immediately** —
  never retained once it's confirmed unusable. The slot shows a specific
  reason ("Image is blurry — hold steady and retake" / "Label is too
  curved to read — try a flatter angle or more distance" / "No readable
  text detected") and a Retake action.
- Unlimited retries per slot; a prior failed attempt leaves no trace in the
  active UI once a later attempt passes (it's preserved in the audit trail
  per `13-history-and-hierarchy.md`, just not shown here).

### Step 4 — Metadata & Manual Entry

Unchanged from prior scope:
- **Metadata**: product category (dropdown, routes to the correct
  declaration checklist), manufacturer (optional autocomplete text),
  inspection region (dropdown/text), e-commerce listing URL (optional, with
  the clarifying caption from the scope note above)
- **Manual Entry**: a form to enter declaration fields directly without OCR,
  for cases where OCR isn't viable (damaged label, officer already has the
  information transcribed)

### Step 5 — Submit → Processing Pipeline Tracker (separate route:
`/scan/[id]/status`)

On submit, route here rather than resolving everything behind one spinner.
Vertical stepper, each stage pending / in-progress / completed / skipped /
failed:

1. **Uploading** — images transferring
2. **Quality check** — already resolved before this screen; shown completed
   for continuity
3. **Text extraction (OCR)** — PaddleOCR runs on all three images
4. **Fallback extraction** — shown only when triggered (any field below the
   configured confidence threshold gets re-run through the Gemini fallback
   path); if nothing needed fallback, shown as **skipped and labeled**
   ("Not needed — all fields extracted with high confidence"), never
   silently omitted
5. **Structuring (LLM)** — raw OCR output from all three images reconciled
   into one structured record, resolving redundancy across images (e.g. MRP
   appearing on both Front and Side-PDP) and attributing each field back to
   its source image
6. **Rule engine evaluation** — Rule 6/7/8 checks produce the violation list
   and font-size checks
7. **Compliance score computed**
8. **Ready for verification** — terminal state; auto-navigates or offers a
   "Review now" button to Declaration Extraction & Verification (page 4)

Each completed stage shows a one-line result summary inline (e.g. "OCR
complete — 6 of 7 fields ≥90% confidence", "Fallback used for 1 field:
Country of Origin", "3 rule violations found"). Each failed stage offers a
retry scoped to just that stage where technically possible (e.g. re-running
OCR without re-uploading images).

## 3. User Flow

1. Officer lands on the wizard, picks a capture mode
2. If mobile handoff: officer scans QR, phone connects, captures happen on
   phone, desktop mirrors progress live
3. Officer captures/uploads Front, Back, Side-PDP — each passes the quality
   gate independently, with retakes as needed
4. Officer fills metadata (or uses manual entry instead of the capture flow
   entirely)
5. Officer submits → redirected to the Processing Pipeline Tracker
6. Tracker runs through all 8 stages automatically; officer can leave and
   return (progress persists server-side, e.g. via the record's own history
   in Compliance Records) or wait and get auto-navigated on completion
7. On reaching "Ready for verification," proceeds to Declaration Extraction
   & Verification (page 4) with the new record's Compliance Status set to
   `Pending` (Verification Status: `Extracted`)

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| No capture mode selected, tries to proceed | Inline prompt to pick one of the three cards |
| Mobile QR expired before phone connects | Expired state, "Generate new code" action |
| Mobile session cancelled from desktop | Mobile companion page shows a clear "session ended" state if still open |
| Image fails quality check | Slot-specific reason, image deleted, Retake offered, other slots unaffected |
| One slot filled, others empty | Wizard clearly shows which slots remain, cannot proceed to Step 4 |
| Poor connectivity / offline | Queue the scan locally with a "will sync when online" indicator |
| A pipeline stage fails | That stage shows a specific error and a stage-scoped retry, doesn't restart earlier completed stages |
| Officer navigates away mid-pipeline | Returning to the record or the tracker URL resumes showing current progress, not a restart |

## 5. UX4G / Design Notes

- Reuse `Input`, `Select`, `Button`, `Card` from the shared library for
  metadata and manual entry. Reuse `Stepper`/`Timeline` component if one
  exists in this UX4G integration for both the wizard's own progress and
  the Processing Pipeline Tracker — check before building a custom one.
- Camera-capture control must meet the 44×44px minimum touch target — this
  page (and its mobile companion) is used on phones in the field more than
  any other page in the app.
- Upload area / capture slot borders use `Border/Neutral/Strong` at rest,
  shift on drag-hover or active-capture using an interactive state token,
  not an invented color.
- Every status indicator (quality check result, pipeline stage) needs
  icon + label — never color alone, per the no-color-only rule.
- The mobile companion route intentionally has **no sidebar/header shell**
  — it's a focused, single-purpose capture surface, not a full app view.

## 6. Definition of Done

- [ ] Capture mode select offers exactly three options, each functional
- [ ] Mobile handoff QR session is single-use, time-limited, and scoped to
      one scan draft
- [ ] Front/Back/Side-PDP are three independently fillable, independently
      retriable slots
- [ ] Every image passes the quality gate before being accepted; rejected
      images are deleted, not merely hidden
- [ ] Quality failure reasons are specific, never a generic "upload failed"
- [ ] Manual entry exists as a full alternative path to the capture flow
- [ ] Processing Pipeline Tracker shows all 8 stages; fallback OCR is
      explicitly marked "not needed" when skipped, never omitted
- [ ] New records default to Compliance Status `Pending` on reaching
      "Ready for verification"
- [ ] Format/size limits and required angles are stated visibly before a
      bad attempt, not only after

## 7. Claude Code Prompt

```
Build the Scan Capture Wizard (page 3), its Mobile Capture Companion route,
and the Processing Pipeline Tracker route, inside our existing app shell
(the wizard and tracker use the shell; the mobile companion does not).

Reuse existing components: Input, Select, Button, Card, and a Stepper/
Timeline component if one already exists in our UX4G integration — check
before building a custom stepper. Do not create new one-off styling; if an
existing component doesn't fit, tell me before improvising.

This page is for scans that start from a physical photo. Note in a caption
on the e-commerce URL field that it's only for linking an additional online
listing of a physically-scanned product — scanning directly from an online
listing with no photo lives on a separate page (E-commerce Listing Scanner).

Sections needed, in order:
1. Capture mode select — three cards: Upload from device / Use this
   device's camera / Continue on mobile
2. Three named capture slots — Front, Back, Side (Principal Display Panel)
   — each independently fillable and retriable, each gated by an Image
   Quality Inspection step (blur / distortion / curvature / no-text-
   detected checks) before being marked filled. Failed images show a
   specific reason and are deleted, not just hidden, with unlimited retries.
3. Mobile Handoff panel — shown when "Continue on mobile" is picked: QR
   code + text fallback code for a single-use, time-limited session scoped
   to this scan draft, live status as the phone connects and captures each
   angle, expiry countdown with "Generate new code," and a Cancel action.
4. Mobile Capture Companion — separate route, no sidebar/header shell,
   camera-first, showing the same three named slots with one emphasized as
   "next," confirming each capture, ending in a clear "you can close this
   page" state.
5. Metadata form — product category (dropdown), manufacturer (optional
   autocomplete), inspection region (dropdown/text), e-commerce URL
   (optional, with the caption above).
6. Manual Entry — full alternative form to enter declaration fields
   directly without OCR.
7. Processing Pipeline Tracker — separate route, vertical stepper with all
   8 stages (Uploading, Quality check, Text extraction/OCR, Fallback
   extraction, Structuring/LLM, Rule engine evaluation, Compliance score,
   Ready for verification), each pending/in-progress/completed/skipped/
   failed, each completed stage showing a one-line result summary, fallback
   OCR explicitly shown as "skipped — not needed" rather than omitted when
   unused, stage-scoped retry on failure.

States to implement explicitly:
1. No capture mode selected on proceed attempt — inline prompt
2. Mobile QR expired before connecting — expired state + regenerate
3. Image fails quality check — specific reason, deleted, retake offered,
   other slots unaffected
4. Attempting to proceed with slots still empty — clear indication of
   what's missing
5. Poor connectivity — queue locally with "will sync when online"
6. A pipeline stage fails — stage-specific error, stage-scoped retry, no
   restart of already-completed stages
7. Returning to an in-progress pipeline tracker — resumes current state,
   never restarts

On reaching "Ready for verification," route to Declaration Extraction &
Verification carrying this scan's ID. The new record's Compliance Status
should default to Pending.

Build this to feel considered, not templated — this page will be demoed
live to judges more than any other page in the app (it's the PS's core
loop), so treat the capture-mode cards, the quality-check moment, and the
pipeline tracker's stage transitions as the places worth real design
attention, while staying strictly inside our locked UX4G tokens and
components — no new colors, spacing values, or components invented outside
that system. One deliberate, orchestrated transition (e.g. how a slot
fills in once an image passes quality, or how the tracker advances between
stages) is worth more here than decoration on every element.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
