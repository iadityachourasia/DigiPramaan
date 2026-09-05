# DESIGN_SYSTEM.md
### Government of India digital product — merged design contract
Sources merged: `Design.md` (UX4G v3 contract, authoritative), `UX4G_BRD_Template.md` (brand/content intake), `UX4G_CodeGen_Prompt_v1.md` (process scaffolding only — see §0), `SKILL.md` (agent preflight contract). Plus an added visual-composition layer (§10) for achieving a modern, minimal, premium feel using only sanctioned UX4G tokens.

---

## 0. Authority order — read this before anything else

1. **`Design.md` is authoritative for every token, color, class name, and package decision.** If any other file in this project (including old copies of `UX4G_CodeGen_Prompt_v1.md`) states a different hex value, a different token name, or a different styling approach, `Design.md` wins, full stop.
2. **`UX4G_CodeGen_Prompt_v1.md` is NOT a source of truth for tokens, colors, or styling method.** It was written against a different, fictional token scheme (`--ux4g-color-brand-primary: #003087`, flat naming) that does not match Design.md's real structure (`Group/SubGroup/Role/State`, e.g. `Background/Brand/Primary/Strong`) or its real primary color (`#4A2BC2` light / `#A391FF` dark). It also assumes Tailwind utility classes (`sm:grid-cols-2`) where Design.md mandates dependency-free `ux4g-*` classes. **Do not use its `tokens.css` / `brand.css` code samples, its color values, or its Tailwind-flavored responsive patterns.** Its genuinely reusable parts — phased build order, self-audit checklist structure, i18n/mock-data/routing conventions, image-placeholder philosophy — are preserved in `IMPLEMENTATION_GUIDE.md` and `ACCESSIBILITY_AND_QA.md`, rewritten to reference real UX4G tokens.
3. **Literal CSS custom property names are not fully enumerated in Design.md.** Design.md documents the naming *convention* (`--ux4g-` prefix, lowercase-hyphenated) and the Figma-side semantic names, but not an exhaustive dictionary. Before writing `var(--ux4g-...)` anywhere, confirm the exact string against the installed `ux4g-web-components` package's compiled CSS or `https://doc.ux4g.gov.in/web/ai.txt` → `llms.txt`/`llms-full.txt`. **Never construct a token name by guessing from the Figma name's pattern** — that guess is exactly how the CodeGen prompt's fabricated tokens came to exist.
4. **`UX4G_BRD_Template.md` gates brand decisions.** Section 11 of that template (Design & Brand Requirements) is the only legitimate source for this product's brand colors, adjectives, radius style, elevation style, and density. If it is unfilled, do not invent brand values — ask, per §0.6 below, or use UX4G defaults with the user's explicit sign-off.
5. **`SKILL.md` is already correctly aligned with Design.md** — its preflight steps, package-selection order, and token-override procedure match Design.md §0.6 exactly. Keep using it as-is; it does not need to be rewritten. This file and `IMPLEMENTATION_GUIDE.md` restate its rules operationally so they sit next to the rest of the contract, not to replace it.

---

## 1. Distribution & package (authoritative — Design.md §0)

| Surface | Artifact | Version |
|---|---|---|
| Design | Figma Community — UX4G Design System 3.0 (`C3Kecl9nh78LLblDUn28P6`) | 3.0 |
| CSS + JS (CDN) | `https://cdn.ux4g.gov.in/UX4G@3.1.0/` | **3.1.0** — pin the exact version, never `@latest` in production |
| Web package | npm `ux4g-web-components` | **2.0.1** |
| Docs (only current source) | `https://doc.ux4g.gov.in/web/` — start at `/web/ai.txt`, follow only `llms.txt`/`llms-full.txt` | v3 |

**Do not use as a source, ever:** `docux4g.dl6.in` (mirror), `ux4g-design.netlify.app` (stale build), `doc.ux4g.gov.in/category/*` or `/components/*.php` (legacy v1/v2 Bootstrap docs that self-label as "v3.0 (Latest)" but document ~16 components — Offcanvas, Button Group, Collapse, Toasts, Range, Select, UX4G Chart, etc. — that do not exist in the shipped package). If a URL is not in the table above and not reachable through `ai.txt`, do not cite it or generate code from it.

**Package selection order:**
1. If `ux4g-web-components` is already installed, use it as installed.
2. Node project, not installed → install and use `ux4g-web-components`. Use **exactly** this name; similarly-named npm packages exist and are not it.
3. Non-Node project → use the pinned CDN assets above.
4. Never mix npm and CDN delivery in one app unless the existing project explicitly requires it.
5. Core web package is dependency-free — do not add dependencies to it (e.g., do not layer Tailwind on top as a styling system; UX4G's own `ux4g-*` utility classes are the styling system).

---

## 2. Token architecture

Three tiers. Implementation code touches tier 2 and tier 3 only — **never** tier 1 primitives directly.

```
Tier 1 — PRIMITIVE   Raw values.        Colors/Primary/600 = #4A2BC2 · Spacing/space-4 (8) = 8
Tier 2 — SEMANTIC    Light+Dark, theme-aware.   Background/Brand/Primary/Strong → Colors/Primary/600
Tier 3 — ROLE        Component-facing, aliases tier 2.   Control/Track/On → {Background.Brand.Primary.Strong}
```

- 256 tokens per theme collection; 90 of those are tier-3 role aliases. Light and Dark expose an identical key set. Any new token must be added to **both**.
- Confirmed CSS convention: every class/custom property is `ux4g-`/`--ux4g-` prefixed, lowercase, hyphenated. Two known deviations exist in the shipped stylesheet and must not be imitated as a pattern: `--ux4x-icon-border-desabled` (wrong prefix + misspelling) and 16 `--Spinner-{variant}-Color-{1,2}` properties (capitalised, unprefixed).
- **Class composition — always write base + variant + size, no exceptions:**
  ```html
  <button class="ux4g-btn ux4g-btn-primary ux4g-btn-md">Save</button>
  ```
  Whether the base class is technically required varies by component (required for `input`/`card`/`alert`/`icon-btn`; optional-but-shared for `btn`/`spinner`; no base rule exists at all for `chip`/`badge`) — and this inconsistency is undocumented in UX4G's own docs. One concrete trap: a button inside `.ux4g-time-slot-weekly-actions` or `.ux4g-time-slot-compact-actions` that omits `.ux4g-btn` silently loses its width/centering rules, with no error. **Always include the base class; it is correct under every model and the only safe habit.**

---

## 3. Primitives (tier 1)

**Spacing — 15 steps, non-linear. The number in the name is an index, not the pixel value.**

| Token | px | | Token | px | | Token | px |
|---|---|---|---|---|---|---|---|
| `space-none` | 0 | | `space-5` | 12 | | `space-10` | 40 |
| `space-1` | 2 | | `space-6` | 16 | | `space-11` | 48 |
| `space-2` | 4 | | `space-7` | 20 | | `space-12` | 56 |
| `space-3` | 6 | | `space-8` | 24 | | `space-13` | 64 |
| `space-4` | 8 | | `space-9` | 32 | | `space-14` | 80 |

**Radius (primitive):** `none 0` · `1: 2` · `2: 4` · `3: 8` · `4: 12` · `5: 16` · `6: 24` · `circular: 999`

**Border width (primitive):** `None 0` · `Thin 1` · `Thick 2` · `Thicker 3` · `Thickest 4`

**Font:** Noto Sans, single family, government-mandated — do not substitute or add a display typeface unless the filled-out BRD §11.4 explicitly requests one **and** the requester understands this is a deviation from the mandated system font. Weights: Regular, Medium, SemiBold, Bold, plus Display SemiBold/Display Bold (used only by the `Display/*` scale). Regional-script fonts (Devanagari, etc.) are auto-assigned per UX4G — do not hand-pick a different Devanagari font.

**Sizes:** 11 · 12 · 14 · 16 · 18 · 20 · 24 · 28 · 32 · 36 · 40 · 52 · 60
**Line heights:** 14 · 16 · 18 · 20 · 24 · 28 · 32 · 36 · 44 · 52 · 72 · 80

**Color ramps — 15 families.** Primary, Secondary, Tertiary, Neutral carry alpha variants (`600A`) alongside solid steps; Neutral additionally carries `0-White`, `0A`, `0B`, and Transparent. Primary/Secondary/Tertiary: 50–950 solid + 50A–950A (22 steps each). Neutral: 50–950 + White/0A/0B + alpha (29 steps). Red, Blue, Sky Blue, Cyan, Green, Lime, Yellow, Gold, Orange, Purple, Pink: 50–950 (11 steps each).

---

## 4. Typography scale (tier 2)

Every style is Noto Sans. 44 named text styles; bind components by **style name**, never by raw px. Each entry has a Default and a Strong weight.

| Scale | Size/LH | Default → Strong |
|---|---|---|
| `Display/L` | 60/80 | Display SemiBold → Display Bold |
| `Display/M` | 52/72 | Display SemiBold → Display Bold |
| `Display/S` | 40/52 | Display SemiBold → Display Bold |
| `Display/XS` | 36/44 | Display SemiBold → Display Bold |
| `Heading/XXL` | 40/44 | SemiBold → Bold |
| `Heading/XL` | 32/36 | SemiBold → Bold |
| `Heading/L` | 28/32 | SemiBold → Bold |
| `Heading/M` | 24/28 | SemiBold → Bold |
| `Heading/S` | 20/24 | SemiBold → Bold |
| `Heading/XS` | 16/20 | SemiBold → Bold |
| `Heading/XXS` | 14/16 | SemiBold → Bold |
| `Title/L` | 24/28 | SemiBold → Bold |
| `Title/M` | 20/24 | SemiBold → Bold |
| `Title/S` | 16/20 | SemiBold → Bold |
| `Body/L` | 18/24 | Regular → SemiBold |
| `Body/M` | 16/24 | Regular → SemiBold |
| `Body/S` | 14/20 | Regular → SemiBold |
| `Body/XS` | 12/16 | Regular → SemiBold |
| `Label/XL` | 16/20 | Regular → SemiBold |
| `Label/L` | 14/18 | Regular → SemiBold |
| `Label/M` | 12/16 | Regular → SemiBold |
| `Label/S` | 11/14 | Regular → SemiBold |

`Heading` and `Title` overlap at 24/20/16 by design. Rule: **`Heading/*`** for document structure that maps to `h1`–`h6`; **`Title/*`** for the heading of a bounded surface (card, modal, dashboard panel) that is not part of the page outline. This distinction matters for screen-reader document-outline navigation — do not use `Heading/*` styling on a card title that isn't a real heading level in the DOM outline, and vice versa.

---

## 5. Semantic spacing — the most common implementation error in this system

Four axes. **The same t-shirt size is a different pixel value on each axis** — this is intentional, and coupling to the number instead of the role is what breaks the next time the scale is retuned.

| Size | `Inline/` | `Stack/` | `Section/` | `Padding/` |
|---|---|---|---|---|
| None | 0 | 0 | 0 | 0 |
| XXS | 2 | 4 | — | 4 |
| XS | 4 | 8 | 24 | 8 |
| S | 8 | 12 | 32 | 12 |
| M | 12 | 16 | 48 | 16 |
| L | 16 | 24 | — | 20 |
| XL | — | — | 64 | 24 |
| XXL | — | — | 80 | 32 |

- `Inline/*` — horizontal gap between siblings on one line.
- `Stack/*` — vertical gap between stacked blocks.
- `Section/*` — vertical rhythm between page sections.
- `Padding/*` — internal padding of a container.

Pick the axis by **role**, never by matching a pixel value you already know. `Inline/L` and `Padding/M` are both 16px today; they are not interchangeable.

**Semantic radius:** `None 0` · `Small 4` · `Medium 8` · `Large 12` · `Full 999`
**Semantic border width:** `Default 1` (Thin) · `Strong 2` (Thick)

---

## 6. Elevation

Five levels, each composed of **two** shadows — key + ambient. Apply both; a single-shadow approximation is not the token, and it will look wrong specifically in Dark mode.

| Level | Key (x y blur spread @ alpha) | Ambient |
|---|---|---|
| 0 | 0 0 0 0 @ 0 | 0 0 0 0 @ 0 |
| 1 | 0 1 2 0 @ 4% | 0 1 2 0 @ 4% |
| 2 | 0 4 8 0 @ 8% | 0 1 2 0 @ 4% |
| 3 | 0 8 16 0 @ 16% | 0 4 8 0 @ 8% |
| 4 | 0 16 32 0 @ 24% | 0 8 16 0 @ 16% |

**Shadow color is theme-bound: black in Light, white in Dark.** Never hard-code `rgba(0,0,0,…)` for a shadow — in Dark mode that renders as an invisible shadow. Use the token, not a literal.

---

## 7. Semantic color

Groups: `Text` · `Icon` · `Background` · `Border` · `Control` · `Action` · `Focus` · `Overlay` · `Shadow` · `Spinner`. Each splits into `Neutral`, `Brand` (Primary/Secondary/Tertiary), and `Status` (Success/Error/Warning/Information) where applicable.

### Core tokens (EXACT — verbatim from Design.md)

| Token | Light | Dark |
|---|---|---|
| `Text/Neutral/Primary` | `#171717` | `#FAFAFA` |
| `Text/Neutral/Secondary` | `#404040` | `#E5E5E5` |
| `Text/Neutral/Tertiary` | `#737373` | `#D9D9D9` |
| `Text/Neutral/Disabled` | `#171717` @ 25% | `#FAFAFA` @ 25% |
| `Text/Neutral/Inverse` | `#FAFAFA` | `#171717` |
| `Text/Brand/Primary/Default` | `#4A2BC2` | `#A391FF` |
| `Background/Neutral/Default` | `#FAFAFA` | `#171717` |
| `Background/Neutral/Elevated` | `#FFFFFF` | `#0A0A0A` |
| `Background/Neutral/Soft` | `#F5F5F5` | `#262626` |
| `Background/Neutral/Subtle` | `#E5E5E5` | `#262626` |
| `Background/Neutral/Emphasis` | `#D9D9D9` | `#404040` |
| `Background/Brand/Primary/Strong` | `#4A2BC2` | `#A391FF` |
| `Border/Neutral/Subtle` | `#E5E5E5` | `#404040` |
| `Border/Neutral/Default` | `#D9D9D9` | `#525252` |
| `Border/Neutral/Strong` | `#737373` | `#A1A1A1` |
| `Focus/Outline` | `#4A2BC2` | `#A391FF` |
| `Overlay/Default` | `#171717` @ 40% | `#FAFAFA` @ 40% |
| `Overlay/Strong` | `#171717` @ 70% | `#FAFAFA` @ 60% |

**Status text:** Success `#00522C`/`#80DA88` · Error `#8A1A16`/`#FFB3AE` · Warning `#AD4E00`/`#FFC973` · Information `#006D75`/`#91E8E0` (Light/Dark).

**⚠️ Known dark-mode surface collision:** `Background/Neutral/Soft` and `Background/Neutral/Subtle` resolve to the **same value** (`#262626`) in Dark. Two surfaces that are visually distinct in Light (a card on a soft background) will look flat/collapsed in Dark if you rely on these two tokens for hierarchy. **Use `Background/Neutral/Elevated` for a real dark-mode layer separation instead of `Soft` vs `Subtle`.**

### Action state matrix

`Action/{Brand|Neutral|Destructive}/{variant}/{state}/{Background|Border|Text}`
- Brand variants: Primary, Secondary, Tertiary, Tonal
- Neutral variants: Secondary, Tertiary
- Destructive variants: Primary, Secondary, Tertiary
- States: **Default, Hover, Active, Disabled** — there is intentionally **no Focus state** in this matrix; focus is a global concern rendered with `Focus/Outline` on top of whatever the current state is. Do not invent a per-variant focus color.

Filled variants use a transparent border (`#000000` @ 0%) so filled and outlined variants share one box model and swap only the border color.

### If custom brand colors are approved (from BRD §11.3)

Map the approved colors to confirmed UX4G primary/secondary/tertiary/status tokens, then override **once at the application root**, in a dedicated theme block:

```css
:root {
  --ux4g-<primary-token>: <approved-value> !important;
  --ux4g-<secondary-token>: <approved-value> !important;
}
```

- Replace placeholders only with token names **confirmed by the shipped package or docs** — never invent one, and never copy a name from `UX4G_CodeGen_Prompt_v1.md`'s sample (see §0).
- `!important` is required so overrides beat the distributed defaults (as of web package v2.0.1, button dimensions use a `:where()` zero-specificity wrapper, so overriding `--ux4g-color-primary-600/700/800` at root is sufficient to theme all button states via the semantic cascade — no per-component override needed).
- Override tokens, never individual component selectors.
- Preserve accessible contrast and semantic state relationships when substituting a color — a "approved brand purple" that fails 4.5:1 against `Background/Neutral/Default` is not a valid override; flag it back to whoever approved it instead of shipping it.
- If the default UX4G theme is chosen, add no override block at all — a redundant override that just repeats the default value is noise.

---

## 8. Breakpoints and grid

| Mode | Range (px) | Columns | Gutter | Page margin | Max content |
|---|---|---|---|---|---|
| Mobile | 0–1023 | 4 | 12 | 16 | 768 |
| Tablet | 1024–1439 | 8 | 16 | 24 | 960 |
| Desktop | 1440–1767 | 12 | 24 | 32 | 1200 |
| Desktop XL | 1768–9999 | 12 | 24 | 32 | 1320 |

**Naming trap:** these names don't match device reality — a portrait iPad (768px) resolves to **Mobile** and gets a 4-column grid; **Tablet** (1024–1439) is in practice landscape tablets/small laptops. Build to the pixel ranges, not to what the label implies about the device.

---

## 9. Accessibility contract (WCAG 2.1 AA baseline — non-negotiable for GoI products)

4.5:1 body text · 3:1 large text and non-text UI boundaries · 44×44px minimum touch target · visible focus via `Focus/Outline` on every interactive element.

### Measured — passes

| Pair | Light | Dark |
|---|---|---|
| `Text/Neutral/Primary` on `Background/Neutral/Default` | 17.18 ✅ | 17.18 ✅ |
| `Text/Neutral/Secondary` on `Background/Neutral/Default` | 9.93 ✅ | 14.23 ✅ |
| `Text/Neutral/Tertiary` on `Background/Neutral/Default` | 4.54 ✅ | 12.70 ✅ |
| `Text/Brand/Primary/Default` on `Background/Neutral/Default` | 8.33 ✅ | 6.87 ✅ |
| `Text/Status/Warning` on `Background/Neutral/Default` | 5.20 ✅ | 11.83 ✅ |
| `Text/Neutral/Inverse` on `Background/Brand/Primary/Strong` | 8.33 ✅ | 6.87 ✅ |
| `Focus/Outline` on `Background/Neutral/Default` | 8.33 ✅ | 6.87 ✅ |

### Known failures — treat as release blockers, not backlog

| Token | Light | Dark | Issue |
|---|---|---|---|
| `Control/Border/Default` (→ `Border/Neutral/Subtle`) | **1.21 ❌** | **1.73 ❌** | Resting border of inputs, checkboxes, radios. Under WCAG 1.4.11 this **is** a required non-text contrast target when it's the only thing indicating a control's extent. At 1.21:1 it is effectively invisible to low-vision users. |
| `Control/Border/Hover` (→ `Border/Neutral/Default`) | **1.35 ❌** | **2.29 ❌** | Same issue on hover. |
| `Control/Track/Off` | **1.35 ❌** | **1.73 ❌** | Toggle/switch off-state track. |
| `Border/Neutral/Default` | **1.35 ❌** | **2.29 ❌** | Acceptable where purely decorative (dividers in an already-bounded table); **not acceptable as a control boundary.** |
| `Text/Neutral/Tertiary` on `Background/Neutral/Soft` | **4.35 ❌** (Light only) | 10.72 ✅ | Marginal failure — 4.35 vs the 4.5 requirement. |

**Fix, don't work around:** for any input/checkbox/radio boundary, repoint to `Border/Neutral/Strong` (4.54:1, passes) or `Control/Border/Error` (4.38:1, passes) rather than shipping the failing default. This is a token-selection decision Claude Code should make explicitly at implementation time, not something to silently inherit from the default and hope nobody notices.

`Text/Neutral/Disabled` at 25% alpha is exempt under 1.4.3 (inactive controls) — but disabled state must never be the *only* signal; pair with `aria-disabled` and supporting text.

---

## 10. Visual composition guide — modern, minimal, elegant, professional, entirely within UX4G tokens

This section is **not** part of the official UX4G contract — it is added judgment for achieving a premium, contemporary feel using only sanctioned tokens and components, informed by well-executed modern dashboard/product UI patterns. Nothing here introduces a new color, font, or token; it is entirely a set of *composition rules* for how to use §1–9 well. Where this section's guidance and Design.md ever appear to conflict on a token/color/class, Design.md wins (§0).

### Card & surface rhythm
- Build every bounded content block (stat, panel, list card, form section) from the UX4G `Card` component at a consistent elevation — pick **one** elevation level for the whole page's "primary card" tier (Level 1 or 2) and do not mix elevation levels within the same visual row; mixing reads as accidental, not intentional.
- Prefer `Background/Neutral/Elevated` over `Soft`/`Subtle` for any card that needs to visibly separate from the page in both themes (see §7's Dark-mode collision warning) — this single substitution is the highest-leverage fix for a "flat, unpolished dark mode" complaint.
- Internal card padding: use `Padding/M` (16px) for compact/dense contexts (admin tables, dashboards) and `Padding/L` (20px) or `Padding/XL` (24px) for citizen-facing content cards — density should be a deliberate per-context choice (BRD §11.8), not accidental inconsistency.

### Dashboard / metric panels (for tracker, admin, or analytics screens)
- A metric/stat card = `Card` + `Label/L` (metric name) + `Heading/M` or `Heading/L` (the number, bold) + `Body/S` in a status color for the delta/trend, composed inside one card — do not build a bespoke component; this is a composition of existing typography + card tokens, nothing new.
- Group related metrics in a 3–4up responsive grid (`grid-cols-1` mobile → `grid-cols-2` tablet → `grid-cols-4` desktop, using UX4G's own grid/breakpoint system from §8, not an ad hoc breakpoint set).
- For status/progress visualizations specific to government service tracking (application status, SLA countdown, multi-step process), UX4G already ships purpose-built components — **use them instead of composing your own:** `Status Pipeline`, `Journey Timeline`, `SLA Progress Indicator`, `Draft Status`, `Stepper`. Reaching for a generic progress bar or custom-built timeline here is exactly the "bespoke atom where a UX4G component exists" anti-pattern (§13below) and these are the components most likely to be skipped by an agent unfamiliar with the less obvious parts of the parity table.

### Data tables (list/tracker/admin screens)
- Use the UX4G `Table`/`List`/`Result List` components with `Badge`/`Tag`/`Chip` for status columns (status color from `Text/Status/*`, never a raw hex) and `Empty State` for the zero-results case — never a hand-rolled "No results" `<div>`.
- Row density follows the same Padding-token decision as cards above — pick once per table type and hold it constant.
- Pagination via the UX4G `Pagination` component, not custom-built page-number buttons.

### Typography discipline
- Exactly one `Display/*` or top `Heading/*` size per page for the primary page title; every subordinate heading steps down through the scale in §4 without skipping levels arbitrarily.
- Use `Title/*` (not `Heading/*`) for card/panel/modal headings that aren't part of the document outline — this is both a visual-hierarchy correctness rule and a screen-reader correctness rule (§4).
- Never let a body text block exceed roughly 65 characters per line on desktop — use `max-width` on the text container, not on the whole section, so surrounding cards/media aren't artificially narrowed.

### Elevation & border discipline (the "minimal" half of "minimal elegant")
- Prefer border (`Border/Neutral/Subtle` or `Default`) over shadow for separating adjacent same-level surfaces (e.g., cards in a grid); reserve visible elevation (Level 2+) for content that's genuinely "above" the page — modals, drawers, popovers, dropdowns.
- Never approximate the two-shadow elevation tokens (§6) with a single hand-written `box-shadow` — besides being off-contract, single-shadow approximations are what breaks first when Dark mode is toggled.

### Motion
- Per BRD §11.8, motion personality is a brand decision (Subtle/functional vs Moderate vs Expressive) — until that's answered, default to **Subtle/functional**: state-change transitions only (hover, focus, expand/collapse), `duration-base` (~200ms), no decorative animation on page load. Always respect `prefers-reduced-motion`.

### Color usage discipline
- Brand primary appears on: primary CTAs, active/selected states, key data highlights, focus outlines — not as a background wash across large neutral content areas. A government service that paints every section in brand-primary reads as a marketing microsite, not a service; reserve the strong brand fill for moments that are genuinely primary actions or identity (header, primary CTA, hero if one exists).
- Status colors (`Text/Status/*`) are reserved for actual status semantics (success/error/warning/info) — never repurposed as decorative accent colors elsewhere on the page. If a design wants a fourth "accent" color beyond primary/secondary/tertiary, that's a BRD §11.3 decision to make explicitly, not something to improvise from the status palette.

---

## 11. Anti-patterns (Design.md §13 — verbatim, binding)

**Tokens**
- No raw hex, rgb, or px in application code. Missing token → propose one, don't invent one silently.
- Never reference tier-1 primitives (`Colors/Primary/600`, `space-4`) directly in application code — use tier 2 or tier 3.
- Never pick a spacing axis by its value. `Inline/L` ≠ `Padding/L`.
- Never assume `space-N` equals N pixels.
- Never hard-code shadow color — it inverts between themes.
- Never apply only the key shadow; elevation is always the key+ambient pair.

**Figma**
- No detached instances, no copy-paste-and-edit of internals.
- Font is Noto Sans via UX4G text styles only — never set `fontName`/`fontSize`/`lineHeight`/`fontWeight` manually.
- Icons from the Material Design Icons file only, never as text glyphs.
- No bespoke atoms where a UX4G component exists: custom banners → `Status Banner`/`System Alert`; custom progress bars → `Linear Progress`; custom step timelines → `Stepper`/`Status Pipeline`; custom empty illustrations → `Empty State`.

**Code**
- Do not hand-edit generated token files.
- Do not override component internals via descendant selectors or `!important` (the one sanctioned exception is the root-level token override block in §7, which is a deliberate, documented exception — not a precedent for overriding internals elsewhere).
- Do not add dependencies to the web core package.
- Do not ship `@latest` on the CDN in production.
- **Added for this project:** do not reintroduce Tailwind utility classes, or any token/color from `UX4G_CodeGen_Prompt_v1.md`'s sample files, as established in §0.

---

## 12. Known debt worth knowing before you build (condensed from Design.md §14)

Ordered by relevance to a fresh implementation, not by the original cost-ranking:

1. **`Control/Border/Default` fails non-text contrast** (§9) — accessibility-mandated system; treat as a blocker, repoint before shipping any form.
2. **`Background/Neutral/Soft`/`Subtle` collide in Dark** (§7) — use `Elevated` for real separation.
3. **Legacy v1/v2 docs still served and self-labelled "v3.0 (Latest)"** — never trust anything outside `/web/*` reached via `ai.txt` (§0/§1).
4. **8 MB CSS bundle** with base64-embedded fonts — real performance cost on constrained mobile connections, which is a meaningful share of the actual GoI user base. If bundle size becomes a measured problem, this is a known, acknowledged upstream issue, not something the consuming project can easily fix — flag it rather than trying to route around it with a competing font-loading strategy.
5. **Class composition inconsistency** (§2) — always write base + variant, no exceptions, per the Time Slot gotcha already documented above.
6. **Version drift across artifacts** — CDN 3.1.0 / npm 2.0.1 / Figma 3.0 have no published mapping; the table in §1 is the only authority until that's fixed upstream.
