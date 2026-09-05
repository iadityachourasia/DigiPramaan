# Page 8 — E-commerce Listing Scanner (USP)

> See `00-README.md` for the Status Model, Role Permission Matrix, and Fixed
> Vocabulary this file assumes. Fixed in this revision: added an explicit
> note distinguishing this page from page 3's optional e-commerce URL field;
> confirmed records created here follow the same Status Model as any other
> scan (default Compliance Status: `Pending`).

## 1. Purpose & Why It Matters

Your PS text explicitly names e-commerce platforms as a sales channel
requiring compliance ("packaged commodities are widely sold through retail
stores, supermarkets and e-commerce platforms"), but a typical competing
team's MVP will only support physical image upload. This page directly
answers a requirement most teams will miss.

**Note on scope**: use this page when there is **no physical photo at
all** — the scan originates entirely from an online listing. If an officer
has *already photographed* a product and separately noticed it's also sold
online, use page 3's optional e-commerce URL field instead of this page.

## 2. Sections & Fields

### URL Input
- Single listing URL field (paste a product page link)
- Category/search-page URL field for bulk mode
- Toggle or tab between Single and Bulk mode

### Scraped Preview
- After submitting a URL, show what was retrieved: listing image(s),
  product title, description text — so the officer can confirm the scrape
  got the right product before running extraction

### Batch Queue (bulk mode only)
- List of listings found from the category/search URL, each with a
  checkbox, thumbnail, title, and individual status (queued/scanning/done/
  failed)
- Select all / deselect all
- "Scan Selected" action

### Pipeline Reuse
- Once a listing's images are retrieved, it feeds into the exact same
  extraction pipeline as a physically-uploaded scan (page 4) — this page
  should not duplicate that logic, only produce the same input shape
- Records created this way are tagged `E-commerce-Sourced`, carry the
  original listing URL as metadata, and default to Compliance Status
  `Pending` just like any other new scan

### Actions
- Scan Listing (single mode), Add to Batch / Scan Selected (bulk mode),
  View Results (routes into Extraction & Verification, or Compliance
  Records for a completed batch)

## 3. User Flow — Single Mode

1. Officer pastes a product listing URL
2. System fetches and shows a preview (image + title) for confirmation
3. Officer confirms and clicks Scan Listing
4. Record is created (Compliance Status: `Pending`), tagged
   `E-commerce-Sourced`, and routed into the same Extraction & Verification
   flow as any other scan

## 4. User Flow — Bulk Mode

1. Officer pastes a category or search-results URL
2. System retrieves a list of individual listings found on that page
3. Officer reviews the batch queue, deselects any irrelevant results
4. Officer clicks Scan Selected
5. Each selected listing processes independently; officer can navigate away
   and return to check batch progress
6. Completed batch results appear in Compliance Records, filterable by
   source = `E-commerce-Sourced` and by this specific batch

## 5. States & Edge Cases

| State | What the user sees |
|---|---|
| Invalid or unreachable URL | Clear error message |
| URL doesn't resolve to a recognizable product listing | Explicit message ("Couldn't identify a product on this page") |
| Bulk fetch returns zero listings | "No listings found at this URL" with a suggestion to check the link |
| Partial batch failure | Batch queue shows per-item status individually — one failed item doesn't block or hide the rest |
| Rate-limited / platform blocks scraping | Explicit message about the limitation, not a generic error |

## 6. UX4G / Design Notes

- Reuse the batch queue's row treatment from the shared `Table` component
  where possible.
- Status per queued item needs icon + label exactly like every other status
  indicator in the system.
- Keep the mode toggle (Single/Bulk) simple and clearly labeled.

## 7. Definition of Done

- [ ] Single and Bulk modes both functional, clearly toggled
- [ ] Scraped preview shown before committing to a scan
- [ ] Batch queue shows independent per-item status, partial failures don't
      block the rest of the batch
- [ ] Records from this page are correctly tagged `E-commerce-Sourced`,
      default to Compliance Status `Pending`, and preserve the source URL
- [ ] Reuses the existing extraction pipeline rather than duplicating it
- [ ] Scope note distinguishing this page from page 3's URL field is
      visible somewhere in the UI (e.g. as help text)

## 8. Claude Design Prompt

```
Build the E-commerce Listing Scanner page inside our existing app shell.
This is a USP feature — directly grounded in our PS, which explicitly names
e-commerce platforms as a sales channel requiring compliance checks. This
page is specifically for scans with no physical photo at all — the scan
originates entirely from an online listing.

Reuse existing components: Table (for the batch queue), status
Badge/Tag/Chip (colored from Text/Status/* tokens), Input, Button, Card.
Do not create new one-off styling — if an existing component doesn't fit,
tell me before improvising.

Sections needed:
- Mode toggle: Single Listing / Bulk (category or search-page URL)
- Single mode: URL input field, scraped preview (image + title +
  description) shown before the officer commits to scanning, then a Scan
  Listing action
- Bulk mode: URL input for a category/search page, then a batch queue table
  listing each found listing with checkbox, thumbnail, title, and
  individual status (queued/scanning/done/failed), select all/deselect
  all, and a Scan Selected action
- Records created from either mode must be tagged E-commerce-Sourced,
  default to Compliance Status Pending, carry the original listing URL as
  metadata, then feed into the same Declaration Extraction & Verification
  flow used for physically-uploaded scans — do not duplicate that
  extraction logic here, only produce the same input shape it expects

States to implement explicitly:
1. Invalid or unreachable URL — clear error message
2. URL doesn't resolve to a recognizable product listing — explicit
   message, don't proceed with empty data
3. Bulk fetch returns zero listings — explicit message with a suggestion
   to check the link
4. Partial batch failure — each queue item shows its own status
   independently; one failure must not block or hide the rest of the batch
5. Scraping blocked/rate-limited by the platform — explicit message about
   this specific limitation, not a generic error

Check this against our design system rules before finalizing and flag
anything that couldn't fully comply instead of approximating it.
```
