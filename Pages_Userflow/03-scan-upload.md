# Page 3 — Scan / Upload Product

> See `00-README.md` for the Status Model, Role Permission Matrix, and Fixed
> Vocabulary this file assumes. Fixed in this revision: added an explicit
> note distinguishing this page's optional e-commerce URL field from the
> dedicated E-commerce Listing Scanner (page 8).

## 1. Purpose & Why It Matters

This is the entry point for the PS's core functionality: "scanning packaged
commodity labels, product images and product information." Field officers
are the primary users, and field conditions are messy — poor lighting, one
hand holding a phone, patchy connectivity. The page needs to be forgiving
of imperfect input rather than assuming a clean desktop upload flow.

**Note on scope**: this page is for scans that start from a **physical
photo**. If a scan should start from an online listing instead, with no
physical photo at all, use the dedicated E-commerce Listing Scanner (page
8) instead — this page's optional e-commerce URL field below is only for
noting that a physically-photographed product is *also* listed online.

## 2. Sections & Fields

### Upload Area
- Drag-and-drop zone (desktop) + prominent "Choose File" / "Take Photo"
  button (mobile-first — camera capture should be first-class, not buried)
- Multiple-file support for photographing several angles of one product
  (front, back, ingredients panel)

### Supported Formats
- JPG, JPEG, PNG, PDF — stated visibly near the upload area, not just after
  a bad attempt

### File Validation
- Type check (reject unsupported formats with a clear message)
- Size check (state the max size limit visibly)
- Duplicate detection (warn if this exact image was scanned recently)

### Document Preview
- Thumbnail(s) of uploaded file(s) before submission, with remove/replace
  per file

### Metadata
- Product category (dropdown — routes to the correct declaration checklist,
  since required fields can vary by category)
- Manufacturer name (optional text field, autocomplete against known
  manufacturers if available)
- Inspection region/state (dropdown or text)
- E-commerce listing URL (optional — see scope note above; this is only for
  noting an *additional* online presence of a physically-scanned product)

### Manual Entry
- A form to enter declaration fields directly, without OCR — for cases
  where OCR isn't viable (damaged label, officer already has the
  information transcribed)

### Upload Status
- Queued → Uploading (progress) → Processing → Completed → Failed, each
  visually distinct

### Actions
- Upload/Submit, Cancel, Retry (on failure), Clear (reset the form)

## 3. User Flow

1. Officer selects or photographs a label image
2. Frontend validates file type/size before upload begins
3. Officer optionally fills metadata (category, manufacturer, region)
4. Officer submits
5. Progress indicator shows Uploading → Processing
6. On completion, frontend redirects to Declaration Extraction &
   Verification with this scan's ID, and the new record's Compliance
   Status is set to `Pending` (Verification Status: `Extracted`)
7. On failure, an error with the actual reason displays, Retry is offered,
   and the officer's already-entered metadata and preview are preserved

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| No file selected, submit attempted | Inline validation, upload area highlighted |
| Unsupported file type | Clear message naming the accepted formats |
| File too large | Message stating the actual limit |
| Duplicate detected | Warning with option to proceed anyway or view the existing scan |
| Upload in progress | Progress bar/percentage, Cancel available |
| Processing (backend OCR queue) | Distinct from "uploading" — e.g. "Upload complete — analyzing label…" |
| Upload failed | Specific reason if available, Retry button, form state preserved |
| Poor connectivity / offline | Queue the scan locally with a "will sync when online" indicator |

## 5. UX4G / Design Notes

- Reuse `Input`, `Select`, `Button` from the shared library for the
  metadata and manual entry forms.
- Upload area border uses `Border/Neutral/Strong` at rest, shifts on
  drag-hover using an interactive state token, not an invented color.
- Status indicators each need icon + label per the no-color-only rule.
- Camera-capture button must meet the 44x44px minimum touch target — this
  page is used on phones in the field more than any other page.

## 6. Definition of Done

- [ ] Camera capture is a first-class, prominent option
- [ ] All 5 upload states are visually distinct with icon + label
- [ ] Failed upload preserves entered metadata and preview
- [ ] Duplicate-detection warning implemented (even if backend stub for now)
- [ ] Manual entry form exists as an alternative path to OCR
- [ ] New records created here default to Compliance Status `Pending`
- [ ] Format/size limits stated visibly before a bad attempt

## 7. Claude Design Prompt

```
Build the Scan / Upload Product page inside our existing app shell.

Reuse existing components: Input, Select, Button, Card. Do not create new
one-off styling — if an existing component doesn't fit, tell me before
improvising.

This page is for scans that start from a physical photo. Note in a caption
or tooltip on the e-commerce URL field that it's only for linking an
additional online listing of a physically-scanned product — the dedicated
flow for scanning directly from an online listing with no physical photo
lives on a separate page.

Sections needed:
- Upload area: drag-and-drop zone (desktop) + prominent camera-capture and
  Choose File buttons (mobile-first)
- Supported formats stated visibly: JPG, JPEG, PNG, PDF
- Multi-file support
- Document preview: thumbnails with remove/replace per file
- Metadata form: product category (dropdown), manufacturer (optional
  autocomplete text), inspection region (dropdown/text), e-commerce listing
  URL (optional, with the clarifying caption above)
- Manual entry form: alternative path to enter declaration fields directly
  without OCR
- Upload status indicator with 5 distinct states: Queued, Uploading (with
  progress), Processing, Completed, Failed — each with icon + label
- Actions: Upload/Submit, Cancel, Retry, Clear

States to implement explicitly:
1. No file selected on submit — inline validation
2. Unsupported file type — message naming accepted formats
3. File too large — message stating the limit
4. Duplicate file detected — warning with "proceed anyway" / "view existing
   scan" options
5. Upload failure — specific reason shown, Retry available, form state
   preserved, not reset
6. Poor connectivity — queue locally with a "will sync when online"
   indicator

On successful completion, route to the Declaration Extraction &
Verification page carrying this scan's ID. The new record's Compliance
Status should default to Pending.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
