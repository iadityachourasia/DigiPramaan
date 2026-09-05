# Page 11 — Citizen Grievance Portal (USP, public-facing)

> See `00-README.md` for the Status Model, Role Permission Matrix, and Fixed
> Vocabulary this file assumes. No changes to this file's logic were needed
> in this revision beyond confirming it correctly uses the source tag
> `Citizen-Reported` and defaults new records to Compliance Status
> `Pending`, consistent with every other intake page.

## 1. Purpose & Why It Matters

Your PS frames this system in terms of "consumer protection" — this page is
the one place that gives an ordinary citizen a direct role in enforcement,
rather than the system being purely an internal officer tool. It's also a
strong live-demo beat. This page structurally differs from every other page
in the system — it has no sidebar/header shell, since it's meant to be
reachable by the public (potentially via a QR code posted in retail stores).

## 2. Sections & Fields

### Landing / Intro
- Brief, plain-language explanation of what this is for
- Trust signal: department name/logo, so it's clearly official

### Submission Form
- Photo upload of the suspicious label (camera capture prioritized) — the
  only required field
- Optional: what seems wrong (multi-select or free text: "Price not
  shown," "No manufacturer info," "Text too small to read," "Other")
- Optional: shop/store name or location
- Optional: submitter name and contact — explicitly optional; requiring
  contact info would suppress submissions

### Submission Confirmation
- Tracking reference number, clearly displayed
- Plain-language explanation of what happens next

### Status Lookup (optional feature)
- A "check your report status" field where a citizen can enter their
  tracking reference to see a coarse status (Received / Under Review /
  Resolved) — a public-facing simplification, not the internal Compliance
  Status vocabulary, and never exposes internal officer workflow detail

## 3. User Flow

1. Citizen scans a QR code in-store or navigates to the portal URL directly
2. Citizen reads the brief intro, taps to start a report
3. Citizen photographs the label (or uploads an existing photo)
4. Citizen optionally adds context — all optional fields clearly marked
5. Citizen submits, without needing to create an account or log in
6. Citizen receives a tracking reference and a "what happens next" message
7. *(Backend)* Submission enters the same extraction pipeline as an officer
   scan, tagged `Citizen-Reported`, defaults to Compliance Status `Pending`,
   and surfaces in the internal Dashboard's alert stream and Compliance
   Records

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| No photo attached, submit attempted | Inline validation — photo is the one required field |
| Poor photo quality (blurry/dark) | A gentle warning suggesting a retake, but does not block submission |
| Submission failed (network) | Clear retry message; don't lose the already-taken photo on retry |
| Status lookup — reference not found | "We couldn't find a report with that reference — please check and try again" |
| Status lookup — found | Coarse public status shown, no internal officer names/workflow detail exposed |

## 5. UX4G / Design Notes

- This page still must follow all UX4G token, accessibility, and typography
  rules — "public-facing" doesn't mean lower standards; if anything,
  touch-target and contrast requirements matter more here.
- No sidebar/header shell, but should still feel like part of the same
  government system (shared typography, shared token palette).
- Anonymous submission should feel equally legitimate as a submission with
  contact info — don't design it as a lesser/incomplete path.
- Photo upload reuses the same upload component/validation logic as the
  officer-facing Scan/Upload page (page 3), presented in a simplified
  public-facing shell.

## 6. Definition of Done

- [ ] No login/account creation required anywhere in this flow
- [ ] Only the photo is a required field
- [ ] Tracking reference is generated and clearly presented on confirmation
- [ ] Submission is tagged `Citizen-Reported`, defaults to Compliance
      Status `Pending`, and uses the same underlying extraction pipeline as
      officer scans
- [ ] Layout has no internal sidebar/header shell but remains visually
      consistent with the rest of the UX4G-based system
- [ ] Status lookup (if built) never exposes internal officer/workflow
      detail

## 7. Claude Design Prompt

```
Build the Citizen Grievance Portal as a standalone public page — no login
required, and no shared app shell (no sidebar/header from our authenticated
pages). It needs its own minimal layout, but must still use our UX4G tokens,
typography, and accessibility standards exactly as strictly as every other
page — public-facing does not mean relaxed standards.

Reuse the underlying upload/validation component from the Scan/Upload page
where possible — this is the same photo-upload capability, presented in a
simplified public-facing shell.

Sections needed:
- Brief plain-language intro explaining the portal's purpose, with a
  department name/logo as a trust signal
- Submission form:
  - Photo upload, camera-capture prioritized — this is the ONLY required
    field
  - Optional: what seems wrong (multi-select or free text: "Price not
    shown," "No manufacturer info," "Text too small to read," "Other")
  - Optional: shop/store name or location
  - Optional: submitter name and contact — must feel equally legitimate to
    leave blank, don't design anonymous submission as a lesser path
- Submission confirmation: clearly displayed tracking reference number, and
  plain-language "what happens next" message
- Optional status lookup: citizen enters their tracking reference and sees
  a coarse status (Received / Under Review / Resolved — this is a
  simplified public-facing label set, distinct from our internal
  Compliance Status vocabulary) — never expose internal officer names or
  workflow detail here

States to implement explicitly:
1. No photo attached, submit attempted — inline validation, this is the
   only required field
2. Poor photo quality detected — gentle retake suggestion, but does NOT
   block submission
3. Submission failed (network) — clear retry, preserve the already-
   captured photo, don't force the user to retake it
4. Status lookup with a reference that isn't found — clear "not found"
   message

Submissions from this page must be tagged Citizen-Reported using our fixed
source vocabulary, default to Compliance Status Pending, and should feed
into the same extraction pipeline used for officer-submitted scans.

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
