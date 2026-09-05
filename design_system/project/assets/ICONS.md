# Iconography

The source file draws its glyphs from **Material Symbols** on a 24×24 grid, with the
icon set modelled as one component per glyph and a single `Style = Outlined | Filled`
variant axis. Outlined is the default everywhere; Filled appears only for selected
navigation items and for status glyphs inside filled surfaces.

Sizes in use, read off the source components: **16px** (tags, captions, S buttons),
**18px** (input leading/trailing icons), **20px** (M buttons, list rows, menu items),
**24px** (L/XL buttons, headers, empty-state and modal status glyphs), **32–36px**
(dropzone and empty-state artwork).

## How this design system ships them

The glyphs are **not** redrawn as hand-rolled SVG. `tokens/fonts.css` loads the
official variable icon font from Google Fonts and `tokens/foundation.css` exposes it as
`.ux4g-icon`:

```html
<span class="ux4g-icon" aria-hidden="true">check_circle</span>
<span class="ux4g-icon" data-fill="true" aria-hidden="true">home</span>
```

Components take a ligature name as a string prop — `<Button iconLeading="add">`,
`<IconButton icon="more_vert">`, `<EmptyState icon="search_off">`.

Rules:
- Icons are `aria-hidden` decoration; the accessible name comes from adjacent text or
  an explicit `ariaLabel`. An icon is never the only carrier of meaning.
- Never mix in a second icon family. No emoji anywhere — the source uses none.
- Unicode characters are not used as icons; the one exception is the masking bullet (•)
  in `InputOTP`.

## Real assets copied out of the file

| File | What it is |
| --- | --- |
| `assets/logo/ux4g-logo-mark-blue.svg` | "UX" half of the UX4G wordmark — fill `rgb(25,55,178)` |
| `assets/logo/ux4g-logo-mark-purple.svg` | "4G" half of the UX4G wordmark — fill `rgb(160,102,204)` |
| `assets/logo/digital-india.svg` | Digital India mark used in the footer access row |
| `assets/logo/negd.png` | NeGD mark (bitmap in the source; copied verbatim) |
| `assets/logo/logo-union-56.svg` | 56px "Logo" placeholder mark from the Logo frame |

`-clean.svg` copies are the same files with the source's C2PA metadata block stripped;
use whichever loads. The file also contains state-emblem and file-type icon families
(~90 file-type glyphs, 36 state/UT emblems) that have **not** been copied out yet.
