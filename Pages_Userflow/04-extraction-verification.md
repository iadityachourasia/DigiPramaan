# Page 4 — Declaration Extraction & Verification

> See `00-README.md` for the Status Model, Canonical Violation Taxonomy,
> Role Permission Matrix, and Fixed Vocabulary this file assumes. Fixed in
> this revision: the finalize action is now named "Confirm & Verify"
> consistently (previously inconsistent with page 6's "Mark Verified");
> confidence display is standardized to percentage + band; the "Extracted"
> vs "Verified" language now explicitly maps to the README's Verification
> Status field, distinct from Compliance Status.

## ⭐ This is your highest-priority page

Everything else in this system is infrastructure around this page. Your
PS's central ask is "automatically detecting, extracting and validating
mandatory declarations" — this page is where a judge sees that actually
happen. If you're time-constrained before a demo, protect this page's build
and review time first.

## 1. Purpose & Why It Matters

Show exactly what the system extracted from a label, ground it in the
actual legal requirement it's checking against, and give the officer a
controlled way to confirm or correct it before it becomes an official
record. Verification Status (`Extracted` → `Verified`) is tracked
separately from Compliance Status (`Pending` / `Compliant` / `Non-Compliant`
/ `Needs Review`) — see the README's Status Model. This page is where
Verification Status changes; Compliance Status gets computed as a result.

## 2. Sections & Fields

### Processing Status
- Queued / Processing / Completed / Failed for the OCR pipeline itself —
  this is a third, short-lived technical state, separate from both
  Verification Status and Compliance Status, and only relevant while the
  pipeline is actively running

### Source Preview (left panel)
- Original uploaded label image, zoomable
- If multiple images were uploaded, a way to switch between them without
  losing place in the right panel

### Extracted Data (right panel) — mapped to the Canonical Violation Taxonomy
Each field is checked against the taxonomy category it corresponds to if it
fails. Confidence is shown as a percentage with a derived band (High ≥90%,
Medium 70–89%, Low <70%):

| Field | Taxonomy category if failed | Legal basis |
|---|---|---|
| Manufacturer/Packer/Importer name & address | Manufacturer/Packer/Importer Details Missing | Rule 6(a) |
| Generic/common name of commodity | Generic Name Missing or Incorrect | Rule 6(b) |
| Net quantity | Net Quantity Missing or Incorrect | Rule 6(c) |
| Month & year of manufacture/import | Manufacture/Import Date Missing | Rule 6(d) |
| Retail sale price (MRP), inclusive of all taxes | MRP Non-Compliance | Rule 6(e) |
| Country of origin (imports only) | Country of Origin Missing | Rule 6 |
| Consumer/customer care details | Consumer Care Details Missing | Rule 6 |

### Font-Size / Readability Check
- Maps to taxonomy category "Font Size / Readability Failure" (Rule 7): MRP
  and net-quantity numerals require minimum 4mm height (6mm if blown/
  molded/embossed). Show pass/fail per relevant field with the measured
  height alongside the required threshold — don't let this get flattened
  into the general confidence score, it's a distinct, PS-specific check.

### Confidence
- Per-field: percentage + derived band (High/Medium/Low)
- Overall extraction confidence summary at the top of the right panel

### Correction Form
- Every extracted field is editable inline
- Edited fields are visually flagged "Corrected" — a distinct visual
  treatment from the low-confidence flag, since they mean different things
  (one is "the system is unsure," the other is "a human changed this")

### Location Data
- Inspection region/state (carried from Scan/Upload metadata, editable here)

### Validation
- Missing-declaration flags: a required field wasn't detected at all —
  distinct from "detected but low confidence," and maps to "Non-Standard or
  Misleading Format" or the specific category above depending on which
  field is missing
- Duplicate-scan warning if applicable

### Final Actions
- **Save Corrections** — persists edits without changing Verification
  Status
- **Confirm & Verify** — the one canonical action that moves Verification
  Status from `Extracted` to `Verified`. Once this runs, Compliance Status
  is auto-computed: `Compliant` if the checklist has zero failed items,
  `Non-Compliant` if it has one or more
- **Retry OCR** — re-runs extraction (e.g. after realizing the image was
  rotated or blurry)

## 3. User Flow

1. User arrives here from Scan/Upload (or from Records, re-opening a
   previously Extracted-but-not-yet-Verified scan)
2. Two-panel layout loads: source image left, extracted fields right
3. Low-confidence and missing fields are visually highlighted so the
   officer knows where to focus
4. Officer reviews each field against the source image, corrects where
   needed
5. Officer reviews the font-size/readability pass-fail results
6. Officer clicks **Confirm & Verify** once satisfied
7. Verification Status becomes `Verified`; Compliance Status is
   auto-computed as `Compliant` or `Non-Compliant` based on the checklist;
   frontend routes to Product Compliance Detail (page 6) showing the
   finalized result

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| OCR still processing | Loading state in the right panel, source image already visible on the left |
| OCR failed entirely | Clear failure message + Retry OCR action, fallback offer to switch to Manual Entry |
| Field not detected at all | Explicitly marked "Not detected — please verify manually," distinct from a low-confidence detection |
| Low-confidence field | Visually flagged (amber-equivalent status + label "Low confidence — please review") |
| Font-size check fails | Explicit fail state showing measured height vs. required threshold, tied to Rule 7 |
| Officer edits a field | Field visually marked "Corrected" going forward |
| Attempting Confirm & Verify with missing required fields | Blocked with a clear message listing which fields are outstanding |
| Already-Verified record reopened | Clearly labeled read-only or "reopen to edit" mode — reopening doesn't silently re-verify |

## 5. UX4G / Design Notes

- Highest information density page in the system — use `Section` spacing
  to separate the two panels clearly, `Stack` spacing within each field row.
- Confidence and pass/fail indicators use status tokens + icon + label,
  never a color-only dot.
- Show Verification Status (`Extracted`/`Verified`) as a persistent,
  visible page-level indicator in the header — distinct in wording and
  placement from Compliance Status, which only appears once computed.
- Corrected-field indicators use a distinct visual treatment from
  low-confidence indicators.

## 6. Definition of Done

- [ ] Every declaration field is represented, mapped to its taxonomy
      category and legal basis
- [ ] Font-size/readability check is distinct, showing measured value vs.
      Rule 7 threshold
- [ ] Verification Status (Extracted/Verified) and Compliance Status
      (Pending/Compliant/Non-Compliant/Needs Review) are never visually
      conflated — they're clearly two different indicators
- [ ] Missing field vs. low-confidence field are visually distinguishable
- [ ] "Confirm & Verify" is the only button that performs the finalize
      action, and is blocked (with a clear reason) when required fields
      are missing
- [ ] Confidence shown as percentage + High/Medium/Low band consistently
- [ ] Corrected fields are visually flagged as officer-edited
- [ ] Two-panel layout remains legible on a laptop screen for live demos

## 7. Claude Design Prompt

```
Build the Declaration Extraction & Verification page inside our existing
app shell. This is the most important page in the system — take extra care
here.

Reuse existing components: Input, Button, status Badge/Tag/Chip (colored
from Text/Status/* tokens), Card. Do not create new one-off styling — if
an existing component doesn't fit, tell me before improvising.

Layout: two-panel. Left panel = original uploaded label image (zoomable,
with a way to switch between multiple images if more than one was
uploaded). Right panel = extracted declaration fields.

Show a persistent, visible Verification Status indicator in the page
header: Extracted or Verified. This must be visually distinct from
Compliance Status (Pending/Compliant/Non-Compliant/Needs Review) — they are
two different things and should never look interchangeable.

Extracted fields, each shown with a confidence score (percentage plus a
derived High ≥90% / Medium 70–89% / Low <70% band) and mapped to its legal
basis:
- Manufacturer/Packer/Importer name & address (Rule 6(a))
- Generic/common name of commodity (Rule 6(b))
- Net quantity (Rule 6(c))
- Month & year of manufacture/import (Rule 6(d))
- Retail sale price / MRP, inclusive of all taxes (Rule 6(e))
- Country of origin — imports only (Rule 6)
- Consumer/customer care details (Rule 6)

Add a distinct Font-Size / Readability Check section: per Rule 7, MRP and
net quantity numerals require minimum 4mm height (6mm if blown/molded/
embossed). Show pass/fail per relevant field with the measured height vs.
the required threshold — keep this clearly separate from the general
confidence score.

Every extracted field must be inline-editable. When a field is edited,
visually flag it "Corrected" — a different visual treatment from the
low-confidence flag, since they mean different things.

Validation behavior:
- A field not detected at all is explicitly marked "Not detected — please
  verify manually," visually distinct from a low-confidence detection
- Low-confidence fields get an amber-equivalent status flag + text label,
  never color alone
- The finalize action, labeled exactly "Confirm & Verify," is blocked if
  required fields are missing, with a clear message listing which fields
  are outstanding. When it succeeds, Verification Status becomes Verified
  and Compliance Status is auto-computed (Compliant if zero checklist
  failures, Non-Compliant if one or more), then route to Product
  Compliance Detail.

Other actions: "Save Corrections" (persists without finalizing), "Retry
OCR."

States to implement explicitly:
1. OCR still processing (right panel loading, left panel already visible)
2. OCR failed entirely — failure message, Retry OCR action, offer to
   switch to Manual Entry
3. Reopening an already-Verified record — clearly labeled distinct mode,
   not silently editable as if unverified

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
