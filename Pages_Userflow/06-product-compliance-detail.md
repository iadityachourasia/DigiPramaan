# Page 6 — Product Compliance Detail

> See `00-README.md` for the Status Model, Canonical Violation Taxonomy,
> Role Permission Matrix, and Fixed Vocabulary this file assumes. Fixed in
> this revision: the action for an unverified record is now "Complete
> Verification" (navigates to page 4, where "Confirm & Verify" actually
> performs the action — these are intentionally different buttons, not
> inconsistent naming); violation wording now uses the canonical taxonomy
> exactly ("MRP Non-Compliance" instead of "MRP not declared"); added the
> "Flag as Needs Review" action; role references use full names.

## 1. Purpose & Why It Matters

This is the page that turns a scan into something legally actionable. Where
page 4 is about the process of extracting and verifying, this page is the
finalized record — the thing that gets cited in an enforcement notice or
attached to a compliance report. The PS's requirement for "generating
compliance reports and violation summaries" is realized here more than
anywhere else in the system.

## 2. Sections & Fields

### Record Header
- Product name, scan ID, Compliance Status pill (Pending / Compliant /
  Non-Compliant / Needs Review), scanned date, last-updated date, source tag

### Declaration Checklist
- Every declaration listed with an explicit pass/fail indicator, using the
  Canonical Violation Taxonomy category name for each failure: manufacturer/
  packer/importer, generic name, net quantity, mfg/import date, MRP,
  country of origin (if applicable), consumer care details
- Font-Size / Readability Failure result (Rule 7) shown here too, as a
  finalized pass/fail, distinct from the working view on page 4

### Source & Extracted Data (side-by-side)
- Original label image next to the finalized extracted values — read-only
  here (editing happens on page 4, reachable via "Complete Verification"
  if unverified, or a separate "Re-verify" action if already Verified but
  needing correction)

### Violation Summary
- For each failed declaration, cite the specific rule using the Canonical
  Violation Taxonomy wording exactly, e.g. "MRP Non-Compliance — Rule 6(e)"
  or "Font Size / Readability Failure — Rule 7, numeral height 3mm, below
  required 4mm minimum." This is what makes the report legally useful and
  is a strong point to highlight in a demo — a generic "non-compliant" flag
  is far less convincing than a specific rule citation.
- If fully compliant, show an explicit positive confirmation ("No
  violations found") rather than an empty section

### Attached Evidence
- Photographs (the PS explicitly requires "attachment of photographs and
  supporting evidence") — supports multiple images, each with a caption/tag

### Audit Trail / History
- Timeline: Scanned → Extracted → Corrected (if applicable, by whom) →
  Verified → Report Generated → Flagged for Enforcement (if applicable) →
  Flagged as Needs Review (if applicable, by whom)
- Each entry timestamped and attributed to a user where relevant

### Actions
- **Complete Verification** — shown only if Verification Status is still
  `Extracted`; navigates to page 4 to actually perform the verification
- **Flag as Needs Review** — per the Role Permission Matrix, available to
  Enforcement Officer, Admin, and Reviewer; applies a manual override to
  Compliance Status
- **Generate Compliance Report** → page 10, pre-filtered to this record
- **Flag for Enforcement** — per the Role Permission Matrix, Enforcement
  Officer and Admin only
- Back to Records

## 3. User Flow

1. User arrives from Compliance Records (View action), a Dashboard alert,
   or directly after completing verification on page 4
2. User reviews the declaration checklist and Violation Summary first
3. User can expand to see the source image / extracted data side-by-side
4. User reviews the audit trail if they need to know who did what and when
5. User takes an action: generate a report, flag for review/enforcement, or
   navigate back

## 4. States & Edge Cases

| State | What the user sees |
|---|---|
| Record still `Extracted` (not yet `Verified`) | Banner prompting completion of verification, with a "Complete Verification" button linking to page 4 — this page never presents unverified data as final |
| Fully compliant record | Violation Summary shows an explicit positive confirmation |
| Missing evidence photos | Explicit "No additional evidence attached" |
| Record already flagged for enforcement | Status/badge reflecting that, flagging action disabled/relabeled to avoid double-flagging |
| Record already flagged Needs Review | Status/badge reflecting that; action relabeled ("Update Review Flag" or similar) rather than allowing a duplicate flag with no context |

## 5. UX4G / Design Notes

- The Violation Summary is the emotional and legal core of this page —
  give it visual priority over the audit trail, which is useful but
  secondary.
- Rule citations should be typographically treated as a specific, quotable
  unit so they're easy to reference during a demo or in an exported report.
- Photographs respect the elevation/card tokens used elsewhere, not a
  bespoke gallery style.

## 6. Definition of Done

- [ ] Violation Summary cites specific rule numbers using the Canonical
      Violation Taxonomy wording exactly, not generic "non-compliant"
      language
- [ ] Fully compliant records show an explicit positive confirmation
- [ ] Unverified (`Extracted`-only) records are clearly banner-flagged with
      a "Complete Verification" action, not presented as final
- [ ] "Flag as Needs Review" is available to all three roles; "Flag for
      Enforcement" is Enforcement Officer/Admin only — matches the Role
      Permission Matrix exactly
- [ ] Audit trail is timestamped and attributed
- [ ] Evidence photo section handles zero, one, and multiple photos cleanly

## 7. Claude Design Prompt

```
Build the Product Compliance Detail page inside our existing app shell.

Reuse existing components: Card, status Badge/Tag/Chip (colored from
Text/Status/* tokens), Button. Do not create new one-off styling — if an
existing component doesn't fit, tell me before improvising.

Sections needed:
- Record header: product name, scan ID, Compliance Status pill, scanned
  date, last updated, source tag
- Declaration checklist: every declaration (manufacturer/packer/importer,
  generic name, net quantity, mfg/import date, MRP, country of origin if
  applicable, consumer care details) with explicit pass/fail, using our
  canonical violation category names for failures, plus the Font-Size/
  Readability Failure result as its own finalized pass/fail line
- Source & extracted data shown side-by-side, read-only on this page
- Violation Summary: for each failed declaration, cite the specific rule
  using our canonical taxonomy wording exactly, e.g. "MRP Non-Compliance —
  Rule 6(e)." Give this section strong visual priority — it's the most
  important content on the page. If fully compliant, show an explicit
  positive confirmation ("No violations found") rather than an empty section.
- Attached evidence: supports zero, one, or multiple photographs with
  optional captions
- Audit trail: timestamped timeline — Scanned → Extracted → Corrected (with
  attribution) → Verified → Report Generated → Flagged for Enforcement →
  Flagged as Needs Review (each only shown if it happened)
- Actions:
  - "Complete Verification" — shown only if Verification Status is still
    Extracted, navigates to the Extraction & Verification page
  - "Flag as Needs Review" — available to Enforcement Officer, Admin, and
    Reviewer roles
  - "Generate Compliance Report"
  - "Flag for Enforcement" — Enforcement Officer and Admin roles only, hide
    or disable for Reviewer
  - "Back to Records"

States to implement explicitly:
1. Record still Extracted, not yet Verified — banner directing the user to
   "Complete Verification" rather than presenting this as a final record
2. Fully compliant record — explicit positive confirmation in the Violation
   Summary
3. Zero evidence photos — explicit "No additional evidence attached"
4. Already flagged for enforcement — reflect this status, disable/relabel
   the action to prevent duplicate flags
5. Already flagged Needs Review — reflect this status, relabel the action
   rather than allowing an unexplained duplicate flag

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
