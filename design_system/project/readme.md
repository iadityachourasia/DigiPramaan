# UX4G Design System 3.0

A code recreation of the **UX4G Design System 3.0 (Beta)** Figma library, built for a
Government of India digital product where UX4G v3 is the mandatory design contract.

**Status.** Foundations (tokens, type, elevation, fonts, icons), all six component groups
and the foundation specimen cards are built. The UI-kit screen recreations are not built
yet — see *Remaining work*.

## Coverage and deliberate omissions

**80 components are built:** all 64 public component families, plus 15 atom families the
source names in its own right and one documented addition.

The automated check counts **1,166 families** and reports 1,101 as unbuilt. That number
is the raw set-and-symbol total, not the public API. The difference is skipped on purpose,
in four classes:

| Skipped | Roughly | Why |
| --- | --- | --- |
| `_`-prefixed atoms that exist only as a fragment of one parent — `_OTP box`, `_Table/Header cell`, `_Tab item`, `_Checkbox control`, `_Date cell`, `_Slider thumb`, `_Stepper Indicator`, `_Caption`, `_Label`, … | ~1,075 | Figma's leading underscore marks them private. Each is a sub-part of a public component and is implemented **inside** that component's markup and stylesheet. Exporting them would publish an API the source library itself does not offer. The 15 atoms that *do* stand alone are built — see `components/atoms/`. |
| Deprecated sets, which the file labels "(deprecated)" | 19 | The file says not to use them. |
| Documentation frames — Changelog, How-to-Use, Design-Specifications, Anti-patterns, Usage-Guidelines, Resources, category covers, file Thumbnail | — | Specification artwork, not components. |
| The icon family, whose only variant axis is `Style = Outlined \| Filled` | ~226 | Shipped as the `.ux4g-icon` class over the real Material Symbols font instead of 226 wrapper components. See `assets/ICONS.md` and *Intentional additions*. |

This is a settled decision, not outstanding work. Full detail under *How the inventory was
counted* and *What is intentionally skipped, and why*.

**Fonts.** The check also reports missing `@font-face` rules. Two distinct causes, both
outside what this project can fix:

1. Noto Sans, Noto Sans Display, Noto Sans Devanagari and JetBrains Mono load from Google
   Fonts through `@import` in `tokens/fonts.css`. The real faces do render; there is simply
   no literal local `@font-face` rule for the check to find. Supply self-hosted `woff2`
   files and `tokens/fonts.css` will be rewritten against them.
2. `--font-weights-regular`, `--font-weights-medium`, `--font-weights-semibold`,
   `--font-weights-displaybold`, `--font-weights-displaysemibold`,
   `--font-weight-sapfontsemiboldduplexfamily` and `--weight-medium` hold weight **names**
   as strings ("Regular", "Medium", "SemiBold", "Display Bold", "Semibold Duplex"). They
   are not font families and no font file exists to upload. Their numeric equivalents are
   `--ux4g-weight-*` in `tokens/fonts.css`. `--font-family-font-1` ("Plus Jakarta Sans") is
   an unused artefact of an imported example frame. All are left pointing at the source
   values, with their fallback stacks rendering, exactly as instructed.

## Sources

| Source | Detail |
| --- | --- |
| Figma file | `UX4G Design System 3.0 - Beta (Community).fig`, attached and mounted read-only. 93 pages, 189,697 nodes, 5,154 local components, 1,260 Figma Variables across 12 collections. No public URL was supplied. |
| Product brief | Supplied in chat: a compliance/enforcement dashboard (products scanned, violations, compliance rate, pending reviews) plus scan-upload, product-metadata, inspection-notes and officer forms. |
| Layout reference | Three admin-dashboard screenshots were described as *layout and information-architecture* inspiration only. **None of their styling is used** — no pastel multi-accent palette, no colour-only status dots, no Inter-like geometric sans. |

Everything below is read out of the .fig. Where the file and the published UX4G web
package differ, **the file wins**.

## What this is

UX4G is the Government of India's shared design system for citizen-facing digital
services, published by NeGD/MeitY. This file is its 3.0 beta: a full component library
(806 published component sets plus 586 standalone symbols), a variable-driven token
system with light, dark, medium-contrast, high-contrast and monochrome modes, four
responsive breakpoint modes, and a set of composed service patterns (identity and
access, application and submission, consent, dashboards, notifications, payments,
search, status tracking, feedback).

The product being built on it is an internal enforcement tool: officers scan products,
record violations, run inspections and issue notices. That shapes every judgement call
in this system — density is desktop-first but touch targets stay at 44px, status is
never colour-only, and every form control clears WCAG 1.4.11.

## Files

| Path | What |
| --- | --- |
| `styles.css` | Global entry point. `@import` lines only — consumers link this one file. |
| `tokens/fig-tokens.css` | 1,252 Figma Variables as CSS custom properties, with 10 theme/mode scopes. Generated from the .fig; do not hand-edit. |
| `tokens/fig-typography.css` | Generated text/effect styles (the file defines its type as *variables*, not text styles, so this is empty by design). |
| `tokens/fonts.css` | Noto Sans / Noto Sans Display / Noto Sans Devanagari / JetBrains Mono + Material Symbols, loaded from Google Fonts. Numeric aliases for the file's named weights. |
| `tokens/typography.css` | The 22 type-scale classes (`.ux4g-display-l` … `.ux4g-label-s`). |
| `tokens/elevation.css` | The five elevation levels composed as proper key + ambient shadow pairs. |
| `tokens/foundation.css` | Page defaults, the focus ring, link colours, `.ux4g-icon`, `.ux4g-sr-only`, `.ux4g-target-44`. |
| `components/<group>/` | React primitives, one `.jsx` + `.d.ts` + `.prompt.md` each, plus a group stylesheet and `@dsCard` specimen HTML. |
| `assets/logo/` | Real marks copied out of the file. |
| `assets/ICONS.md` | Iconography rules and the asset inventory. |
| `guidelines/*.card.html` | 17 foundation specimen cards — colour ramps, type scale, spacing axes, radii, elevation, focus, theme modes, brand discipline. |
| `thumbnail.html` | Homepage tile. |
| `SKILL.md` | Agent-skill entry point. |

## Components

All 64 public component families are built, plus two documented additions.

**actions/** — `Button`, `IconButton`

**forms/** — `InputTextField`, `TextArea`, `Checkbox`, `RadioButton`, `Toggle`, `Search`,
`Combobox`, `DropdownMenu`, `FormFieldGroup`, `InputOTP`, `InputAadhaar`,
`InputPanCard`, `DatePicker`, `TimePicker`, `Slider`, `FileUpload`, `ColorPicker`

**feedback/** — `Badge`, `ContextAlert`, `SystemAlert`, `DraftStatusBanner`, `Modal`,
`Drawer`, `Popover`, `Tooltip`, `Backdrop`, `EmptyState`, `ProgressIndicator`,
`Spinner`, `Feedback`, `SLAProgressIndicator`, `CommentBox`

**data-display/** — `Card`, `StatCard`, `Table`, `Tag`, `Chip`, `ChipGroup`, `Avatar`,
`Thumbnail`, `Image`, `Divider`, `List`, `ResultListRow`, `Accordion`, `Carousel`,
`StatusPipeline`, `JourneyTimeline`, `TimeSlot`

**navigation/** — `Link`, `Breadcrumb`, `NavBar`, `MegaMenu`, `MobileAppHeader`, `Tab`,
`Pagination`, `Stepper`, `Footer`

**utility/** — `AccessibilityBar`, `FocusRing`, `Slot`, `BiometricCapture`, `MapOfIndia`

**atoms/** — source-named sub-components with genuine standalone use:
`StatusIndicator`, `StatusBanner`, `NotificationItem`, `ReferenceId`, `AutosaveIndicator`,
`AttemptCounter`, `PasswordStrength`, `DocumentChecklistRow`, `InfoList`, `ServiceCard`,
`CategoryTile`, `ProviderCard`, `DeviceReadiness`, `ImportanceTag`, `PoweredBy`

### How the inventory was counted

The file's `METADATA.md` lists **806 component sets + 19 deprecated + 586 standalone
symbols**. The great majority are `_`-prefixed *atoms* — `_Checkbox control`,
`_Date cell`, `_Tab item`, `_Table/Data row`, `_OTP box`, `_Slider thumb` — which are
internal parts of a published component, not API surface. Figma's own naming convention
marks them private with the leading underscore.

The **public inventory is the 64 component families that have their own page** in the
file, and that is what this system implements one-for-one. Each public component absorbs
its private atoms (e.g. `Table` contains `_Table/Header cell`, `_Table/Data row`,
`_Table/Line`, `_Table/Cell/*`). Deprecated sets are skipped, as are the file's
category-cover, changelog, how-to-use, anti-pattern and design-specification frames.

### What is intentionally skipped, and why

The automated check counts **1,166 families** and will keep reporting the difference.
That count is the raw set-and-symbol total. Skipped, deliberately:

- **~1,090 `_`-prefixed atoms** (`_Checkbox control`, `_Date cell`, `_Tab item`,
  `_Table/Data row`, `_OTP box`, `_Slider thumb`, `_Stepper Indicator`, `_Search field`,
  `_Action menu item`, `_Caption`, `_Label`, and so on). Figma's leading underscore marks
  them private. Each is a sub-part of a public component and is implemented *inside* that
  component's markup and stylesheet — `_OTP box` is the box inside `InputOTP`,
  `_Table/Header cell` is the `th` inside `Table`. Exporting them as public components
  would publish an API the design library itself does not offer.
- **19 deprecated sets**, which the file marks "(deprecated)".
- **Documentation frames** — Changelog, How-to-Use, Design-Specifications, Anti-patterns,
  Usage-Guidelines, Resources, category covers, and the file Thumbnail page. These are
  specification artwork, not components.
- **The ~226-glyph icon family**, whose only variant axis is `Style = Outlined | Filled`.
  Shipped as the `.ux4g-icon` class over the real Material Symbols font rather than 226
  wrapper components — see *Intentional additions*.
- **The ~90 file-type icon set and 36 state/UT emblems**, which are assets rather than
  components. Not yet copied out; listed under *Remaining work*.

### Intentional additions

- **`.ux4g-icon` glyph helper** — the source models each icon as a Figma component with
  an Outlined/Filled axis. Rather than 226 near-identical wrapper components, the system
  exposes the same Material Symbols set through one CSS class and a string prop. See
  `assets/ICONS.md`.
- **`StatCard`** — the KPI tile the compliance dashboard needs. The file defines `Card`
  and the type scale but no single-metric tile, so this composes them: label, large value,
  and a delta that states its direction in glyph and text. Split out from `Card` so the
  brand-discipline and colour-only rules are enforced in one place rather than re-derived
  per dashboard.

Nothing else is added. No Toast, no Skeleton, no Avatar group — the file does not define
them. `Thumbnail` and `TextArea` are not additions: both are variants inside the source's
own `Thumbnail` page and `Input — Text Field / Text Area` frame.

## Visual foundations

**Colour.** One brand primary: `Colors/Primary/600` = `rgb(74,43,194)`, a deep indigo
violet. Its ramp runs 50 → 900 (`rgb(242,239,255)` → `rgb(48,28,125)`). Secondary and
tertiary ramps exist but are near-unused in the file. Neutrals are a true grey ramp,
0-white through 900 (`rgb(23,23,23)`), and they carry almost all of the interface —
`rgb(23,23,23)` is the single most-used colour in the file (15,909 uses), then
`rgb(250,250,250)`, then white.

Status colours are semantic only: success green `rgb(18,137,55)` / `rgb(16,108,53)`,
error red `rgb(219,55,45)`, warning orange `rgb(238,128,51)`, info blue. **They are
never decorative.** A "success-green" KPI card or an "info-blue" chart series is a
violation of the system, not a style choice.

Design never touches raw primitives. Work in the role tiers:
`Action/{Brand,Destructive,Neutral}/{Primary,Secondary,Tertiary,Tonal}/{state}/{background,border,text}`,
`Background/{Neutral,Brand,Status}/*`, `Border/*`, `Text/*`, `Icon/*`, `Control/*`,
`Focus/*`, `Overlay/*`. A raw `--colors-primary-600` in a design is a bug.

**Brand discipline.** Brand-primary fill is reserved for primary actions, active
states, and identity moments (masthead, primary CTA). It is not a wash across cards and
charts. A government service page that reads as heavily branded reads as marketing.

**Type.** Noto Sans everywhere, all scripts, including Devanagari and other regional
scripts on bilingual reports and labels — no substitution, in any language. Noto Sans
Display is used only for Display-tier sizes. JetBrains Mono is the mono face
(reference IDs, Aadhaar/PAN). Four roles, 22 steps: Display L/M/S/XS (60/52/40/36),
Heading XXL→XXS (40/32/28/24/20/16/14), Title L/M/S (24/20/16), Body L/M/S/XS
(18/16/14/12), Label XL/L/M/S (16/14/12/11). Body S at 14/22 is the workhorse; 12px is
the floor. Weights come as *names* in the variables (Regular, Medium, SemiBold, Bold,
Display SemiBold, Display Bold) and are mapped to 400/500/600/700 in `tokens/fonts.css`.

**Spacing.** The scale is **index-based and non-linear**: `space-1` = 2px, `space-2` = 4,
`space-3` = 6, `space-4` = 8, `space-5` = 12, `space-6` = 16, `space-7` = 20, `space-8` = 24,
`space-9` = 32, `space-10` = 40, `space-11` = 48, `space-12` = 56, `space-13` = 64,
`space-14` = 80. `space-4` means 8px, not 4px.

Four axes sit on top, and they are **not interchangeable** even where two share a pixel
value today. Choose by structural role:

| Axis | Use for | Values |
| --- | --- | --- |
| `--inline-*` | horizontal gaps between siblings | xxs 2, xs 4, s 8, m 12, l 16 |
| `--stack-*` | vertical rhythm between stacked blocks | xxs 4, xs 8, s 12, m 16, l 24 |
| `--padding-*` | interior padding of a container | xxs 4, xs 8, s 12, m 16, l 20, xl 24, xxl 32 |
| `--section-*` | space between major page regions | xs 24, s 32, m 48, xl 64, xxl 80 |

Card interiors take Padding; gaps between stacked cards take Stack; sibling gaps take
Inline; page regions take Section.

**Radii.** `none 0`, `xxs 2`, `xs 4`, `sm 8`, `md 12`, `lg 16`, `full 999`. 8px is the
default for buttons, inputs, cards and tables; 4px for tags and small controls; 999 for
pills and avatars. Values are literal — a tag is 4px, a button 8px, and neither gets
rounded to the other.

**Elevation.** Five levels, each a **two-part key + ambient shadow pair** — never a
single hardcoded `box-shadow`. Offsets/blurs: L1 `0 1px 2px`, L2 `0 4px 8px` over
`0 1px 2px`, L3 `0 8px 16px` over `0 4px 8px`, L4 `0 16px 32px` over `0 8px 16px`. The
shadow colour flips from black in light mode to **white** in dark mode; the composed
`--elevation-0…4` tokens in `tokens/elevation.css` handle that automatically.

**Layer separation in dark mode.** Real separation comes from
`Background/Neutral/Elevated`. `Background/Neutral/Soft` and `.../Subtle` resolve to the
same value in dark mode and would flatten the layering, so cards, panels, menus and
sheets sit on Elevated.

**Borders.** `thin 1`, then thick/thicker/thickest. Cards and tables are a 1px
`Border/Neutral/Subtle` inset. **Form controls use `Border/Neutral/Strong` in every
resting state** — see *Accessibility*.

**Motion.** Restrained and short: 120ms ease on colour and border transitions, 140ms on
the toggle thumb, 200ms on progress fills, 700ms linear for spinners. No bounce, no
spring, no parallax, no decorative entrance animation.

**Interaction states.** Hover moves one step within the same role tier
(`primary-600` → `700`), active/pressed one further (`800`); tonal and text types shift
their tint instead. Nothing scales or lifts on press. Focus is a 2px
`Focus/Outline` ring at 2px offset on **every** interactive element — table rows,
pagination controls, nav items, menu items, buttons alike.

**Surfaces.** Cards are flat: `Background/Neutral/Elevated`, 8px radius, 1px subtle
border, elevation 0–1. Shadow appears when something genuinely floats (menu, popover,
drawer, modal). No gradients as decoration, no glass, no texture, no noise.
Transparency is used only for scrims (`Overlay/*`) and state layers; blur only where the
source specifies it.

**Imagery.** The file carries photographic content only inside its own example frames
(avatars, service illustrations, the India map, state emblems). There is no brand
photography treatment to inherit — no grain, no duotone, no mandated warm/cool grade.

## Content fundamentals

Read off the file's own strings and labels.

**Voice.** Plain, factual, service-desk register. It states what a thing is and what to
do next; it does not sell, joke, or editorialise.

**Person.** Second person for instructions to the user ("Enter the code sent to your
registered mobile number"), first person only inside consent and declaration statements
the user is affirming ("I consent to the declaration"). System actions are stated
impersonally ("Your application has been submitted"), never "We've got it!".

**Casing.** Sentence case for everything — headings, buttons, labels, table headers,
menu items. No Title Case, no ALL CAPS except statutory abbreviations (PAN, OTP, SLA,
UIDAI). Field labels are nouns ("Batch code"); buttons are verbs ("Submit application",
"Save draft", "Issue notice"). No terminal full stop on labels and buttons; full
sentences in captions and descriptions do take one.

**Errors.** Name the problem and the fix, in the caption slot under the field: "Batch
code must be 8 characters", not "Invalid input". Never blame the user.

**Numbers and formats.** Dates DD/MM/YYYY. Times 12-hour with AM/PM by default. Indian
numbering where the file uses it. Reference IDs monospaced (`INS/2026/00841`). Aadhaar
grouped 4-4-4 and masked after capture.

**Emoji.** None. The file contains none and the register does not admit them. The
sentiment faces in `Feedback` are Material Symbols glyphs with text labels, not emoji.

**Bilingual copy.** Devanagari and other regional scripts render in Noto Sans; leave
~30% extra width for Hindi labels, and never set a regional string in a substitute face.

## Accessibility

WCAG 2.1 AA is the floor, not an aspiration.

1. **Form-control borders.** The source's default control border resolves to
   `Colors/Neutral/200` — about **1.21:1** against white, failing 1.4.11 non-text
   contrast. Every input, checkbox, radio and toggle track in this system therefore uses
   `Border/Neutral/Strong` in every resting state, or `Control/Border/Error` where an
   error applies. This is a deliberate, documented deviation from the raw Figma default
   and is a hard requirement, not a preference.
2. **Status is never colour alone.** Every status carries a glyph and/or a text label
   beside its token (1.4.1). The reference dashboard's coloured-dot-plus-text pattern is
   not reproduced without an icon.
3. **Text contrast** 4.5:1 minimum; body text uses `Text/Neutral/Primary` or
   `/Secondary`, never `/Tertiary`, for anything load-bearing.
4. **Touch targets** 44×44px minimum. Button sizes L (48) and XL (56) clear it alone;
   S (32) and M (40) are desktop-density only. `.ux4g-target-44` is available for
   anything that needs padding out.
5. **Visible focus on everything interactive** — including table rows, pagination
   controls and nav items.
6. **Every field has a real, programmatically associated label.** Placeholders are not
   labels. Radio and checkbox sets live inside `FormFieldGroup`'s `fieldset`/`legend`.

## Implementation notes

- The UX4G web package is dependency-free by design. **No Tailwind or other utility CSS
  framework** on top of it. Styling stays in the token layer and the component
  stylesheets.
- Components import React only and reference styling through CSS custom properties.
- Theme switching: `data-theme="light" | "dark"` on `:root`, plus `data-mode` for the
  wireframe, breakpoint, contrast and monochrome modes the file defines.

## Remaining work

1. UI kits recreated from the file's own pattern pages: Identity and access,
   Application and submission, Dashboard and my applications, Status and tracking,
   Notifications, Search and discovery — plus the compliance dashboard shell from the
   brief (KPI row, violations-over-time chart, violation-type donut, ranked regional
   list, scanned-products table, audit feed, regional heat-map).
2. Copy out the remaining asset families: ~90 file-type icons, 36 state/UT emblems, the
   India map geometry `MapOfIndia` needs, and the source's empty-state artwork.
3. Templates for consuming projects (the picker that replaced starting points).

## Open questions

- **No primary, secondary or status colours have been supplied for this product**, so
  everything here is the stock UX4G theme. This is flagged as a confirm-before-launch
  item, not a guess to be inherited.
- The file references `Plus Jakarta Sans` in one unused variable
  (`--font-family-font-1`) and carries stray Inter, Roboto, Poppins, Schibsted Grotesk
  and Druk Wide strings inside imported example frames. All are treated as artefacts;
  Noto Sans is the system face.
- No font binaries ship inside a `.fig`, so the Noto families load from Google Fonts via
  `@import`. Because no literal `@font-face` rule is written locally, the automated check
  reports the fonts as missing; the faces do load in the browser. If the programme
  requires self-hosted `woff2` files, supply them and `tokens/fonts.css` will be rewritten
  against them.
- The generated token file contains `--font-weights-*` and `--font-weight-sap*` variables
  whose values are weight *names* as strings ("Regular", "Medium", "SemiBold",
  "Display Bold", "Semibold Duplex"). The automated check reads them as font families and
  asks for font files. They are not families and no font exists to upload; the numeric
  equivalents live in `tokens/fonts.css` as `--ux4g-weight-*`. Left pointing at the
  source values, as instructed.
