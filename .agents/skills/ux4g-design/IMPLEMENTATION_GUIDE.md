# IMPLEMENTATION_GUIDE.md
### Operational contract for Claude Code on this project

Read `DESIGN_SYSTEM.md`, `COMPONENT_SPEC.md`, `ACCESSIBILITY_AND_QA.md`, `PAGE_COMPOSITION.md`, `VISUAL_QA_LOOP.md`, and `MCP_AND_TOOLING_SETUP.md` in full before writing any code. This file sequences how to actually build, using them. `SKILL.md` is already correctly aligned with the underlying UX4G contract and stays in force as-is — this file restates its preflight steps inline so the full build sequence is in one place.

**What each file is for, in one line:** `DESIGN_SYSTEM.md` = tokens and rules. `COMPONENT_SPEC.md` = what to build things out of. `PAGE_COMPOSITION.md` = how to arrange those things on a page so it has visual hierarchy. `ACCESSIBILITY_AND_QA.md` = the compliance/functional check. `VISUAL_QA_LOOP.md` = the visual check — the only one of the six that involves actually looking at the rendered output rather than reasoning about code. `MCP_AND_TOOLING_SETUP.md` = which external tools power the others, and which popular tools to explicitly avoid because they'd fight the mandatory token system. All six are required; token/component compliance alone does not produce good composition, and good composition alone does not produce a compliant product.

---

## Step 0 — BRD gate (do not skip, even under time pressure)

`UX4G_BRD_Template.md` is the only legitimate source for this product's brand colors, tone, personas, page inventory, and content rules. Before any implementation decision that the BRD is meant to answer:

1. Check whether the BRD has actually been filled in — a blank template is not a filled BRD.
2. If sections below are unanswered, **ask the user**, do not infer or default silently, because these directly gate visual/brand decisions:
   - §11.2 Brand adjectives + visual tone
   - §11.3 Colour (primary/secondary/tertiary/status overrides, or explicit "UX4G default")
   - §11.4 Typography (confirm Noto Sans default, or a stated deviation)
   - §11.5 Shape (corner radius style, elevation style, border style)
   - §11.6–11.8 Iconography, photography/illustration, motion/density
   - §9.1 Language plan (which locales at launch)
   - §4 Primary persona + most-extreme accessibility need (sets the a11y design floor)
3. Everything else in the BRD that's silent can follow the Level 1–4 gap-filling framework below — but §11 brand/visual fields specifically should not be guessed, because Design.md's own preflight rule (§0.6) requires asking the user for theme colors before writing implementation code, with an explicit "stay on UX4G default" option offered in the same question.

**Gap-filling framework for everything else the BRD doesn't cover:**
- **Level 1** — BRD states it explicitly → implement as stated.
- **Level 2** — BRD implies it → infer, implement, document the reasoning in a comment.
- **Level 3** — BRD is silent → apply the best-practice default from DESIGN_SYSTEM.md §10, implement fully, add a `// TODO:` comment explaining the decision so it's easy to find and revisit.
- **Level 4** — BRD conflicts with accessibility or the UX4G contract → implement the compliant version, add a `// NOTE:` comment explaining the override, and flag it to the user rather than silently overriding a stated requirement.

---

## Step 1 — Preflight (Design.md §0.6 / SKILL.md, restated)

1. Read `DESIGN_SYSTEM.md`, `COMPONENT_SPEC.md`, `ACCESSIBILITY_AND_QA.md`, `PAGE_COMPOSITION.md`, `VISUAL_QA_LOOP.md`, `MCP_AND_TOOLING_SETUP.md` completely.
2. Inspect the actual project: installed dependencies, any existing UX4G integration, existing components/styles/tokens/routes/conventions. Don't assume a clean slate.
3. Check which tools from `MCP_AND_TOOLING_SETUP.md` §1 are already connected (Chrome DevTools/Playwright MCP, Figma Dev Mode MCP, Web Interface Guidelines skill) and which of §2's excluded tools are present from a template/global config — treat the latter as inert for this project, don't invoke them. If none of §1's tools are connected yet, tell the user which ones would materially help before starting Phase 1, rather than silently building without a visual QA loop available.
4. If BRD §11.3 hasn't answered it yet, ask the user for theme colors now — primary and secondary at minimum, tertiary/status colors if relevant — **and explicitly offer the default UX4G theme as a valid answer.** Do not write implementation code until this is answered.
5. Confirm package delivery method per DESIGN_SYSTEM.md §1's order (installed → npm install → CDN, never mixed without explicit reason).
6. **Before writing code**, list every UX4G component you're about to use, with exact variant and size, and where each one goes. This is the "component plan" — present it, then build.
7. If any BRD requirement needs something UX4G doesn't provide (see COMPONENT_SPEC.md §2's ❌ list and §4 gap register), name the gap explicitly before writing any custom markup or CSS for it.

---

## Step 2 — Tech stack

Framework/language defaults below apply **only where the BRD doesn't specify otherwise** — BRD wins if it states a stack.

```
Framework:      Next.js (App Router), TypeScript strict mode
Styling:        UX4G ux4g-* classes + CSS custom properties for UX4G tokens.
                Do NOT add Tailwind as a parallel styling system — the UX4G web
                package is dependency-free by design (DESIGN_SYSTEM §1/§11), and
                a second utility framework fights it for the same job. If the BRD's
                technical constraints explicitly mandate Tailwind, resolve that
                conflict with the user before building — don't silently run both.
Components:     ux4g-web-components (npm) or CDN — never both in one app
Icons:          Material Design Icons file only, per Design.md's Figma rule —
                for web, use the icon set UX4G itself ships/references; don't
                introduce a second icon library (e.g. lucide-react) unless BRD
                explicitly calls for icons outside UX4G's set, and even then,
                match the outline/weight style so icons don't visually clash
Forms:          React Hook Form + Zod is a reasonable Level-3 default for
                validation logic — but the rendered markup must be UX4G's
                Form Field / Input / Input Aadhaar / Input PAN Card / OTP /
                File Upload components, not custom-styled inputs
i18n:           next-intl or equivalent — required from the start per BRD §9.1,
                not retrofitted later
Charts:         No UX4G component covers this (COMPONENT_SPEC §4) — use a real
                charting library, styled from UX4G color tokens, not hardcoded hex
Testing:        Vitest + React Testing Library + Playwright (E2E) — Level 3 default
Linting:        ESLint + Prettier + eslint-plugin-jsx-a11y enforced at zero warnings
```

---

## Step 3 — Project structure

```
/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout — fonts (Noto Sans + regional scripts), providers
│   │   ├── page.tsx               # homepage
│   │   ├── globals.css            # imports tokens.css + brand.css + typography.css
│   │   └── [route]/page.tsx       # one per route in BRD §6.1 sitemap, plus loading.tsx/
│   │                               # error.tsx/not-found.tsx per route
│   ├── components/
│   │   ├── ui/                    # thin wrappers around UX4G classes where TS props help
│   │   ├── layout/                # Header/Navbar, Footer, AlertBanner, PageWrapper
│   │   ├── sections/               # homepage/page-level sections
│   │   └── [feature]/             # feature-specific composed components (see
│   │                               # COMPONENT_SPEC.md §3 recipes — MetricCard,
│   │                               # DashboardPanel, ApplicationTracker, etc.)
│   ├── lib/
│   │   ├── api/                   # real API client functions
│   │   ├── mock/                  # mock data matching real API shape, for dev
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── validations/           # Zod schemas per form
│   ├── styles/
│   │   ├── tokens.css             # UX4G tokens as CSS custom properties — generated
│   │   │                          # from the ACTUAL installed package/docs, never
│   │   │                          # hand-guessed (DESIGN_SYSTEM §0)
│   │   ├── brand.css              # this product's root token overrides, from BRD §11.3
│   │   └── typography.css         # font-face declarations, Noto Sans + regional scripts
│   ├── types/                     # TS interfaces per domain
│   └── messages/                  # en.json, hi.json, + BRD §9.1's other launch locales
├── public/
│   ├── images/placeholder/        # branded placeholders, not grey boxes (Step 5)
│   └── fonts/
├── tests/{unit,integration,e2e}/
├── .env.local / .env.example
```

### tokens.css — generation rule

Do not hand-write this file from memory or from any prior sample (including `UX4G_CodeGen_Prompt_v1.md`'s, which is invalid per DESIGN_SYSTEM §0). Generate it by:
1. Inspecting the actual installed `ux4g-web-components` package's compiled CSS for the real `--ux4g-*` custom property names, **or**
2. Reading `https://doc.ux4g.gov.in/web/ai.txt` → `llms.txt`/`llms-full.txt` for the current documented token names.

Only after the real names are confirmed does `brand.css` get written, containing this product's root overrides mapped from BRD §11.3, in the format specified in DESIGN_SYSTEM.md §7.

---

## Step 4 — Images

No empty/grey placeholder containers, ever. Priority order:
1. Real image from `public/images/` via the framework's optimized image component.
2. A styled placeholder that communicates brand + content intent: background at a low-opacity tint of the brand primary token, centered relevant icon (from the UX4G/Material icon set), correct aspect ratio maintained — never a flat grey `#e5e5e5` box, never a broken `<img>`.
3. Source of real imagery should follow BRD §11.7 (official media library / approved stock vendor / AI-generated) — do not default to a generic stock-photo API unless BRD specifies it's acceptable for development only, and mark such images clearly as placeholders pending real assets.

---

## Step 5 — Build order

```
PHASE 1 — Foundation
  1. Project structure (folders + blank files)
  2. package.json
  3. tokens.css (real names, per Step 3's generation rule) + brand.css (from BRD §11.3) + typography.css
  4. globals.css importing the above
  5. .env.example
  6. TypeScript interfaces for every domain in the BRD
  7. messages/en.json + one file per BRD §9.1 launch locale
  8. mock/ data for every domain the BRD's page inventory implies
  → Present Phase 1 output before proceeding.

PHASE 2 — Layout shell
  9. Navbar/Header, Footer (with all BRD §9.4 mandatory content), Breadcrumb,
     Accessibility Bar if GIGW-required, AlertBanner if BRD needs one
  10. Root layout wiring it all together
  → Run VISUAL_QA_LOOP.md against the shell (empty/mock page content) at all
    breakpoints before building any real page against it — a grid/nav/footer
    composition mistake here repeats on every single page if caught late.

PHASE 3 — P1 journey pages (BRD §5, P1-priority journeys first)
  11. Homepage + its sections — build against PAGE_COMPOSITION.md §1's spec,
      then run VISUAL_QA_LOOP.md immediately, before moving to the next page
  12. Every page in the P1 user journey's step sequence — build each against
      the matching archetype in PAGE_COMPOSITION.md §1–9, then run
      VISUAL_QA_LOOP.md on that page before moving to the next one
  → Run the full self-audit (ACCESSIBILITY_AND_QA.md §3) after this phase.

PHASE 4 — Remaining pages
  13. Every remaining page in BRD §6.2's page inventory, same per-page pattern:
      build against the matching PAGE_COMPOSITION.md archetype, then
      VISUAL_QA_LOOP.md immediately, then move on
  → Run the full self-audit again.

PHASE 5 — States and edges
  14. loading/error/not-found for every dynamic route — empty-state archetype
      per PAGE_COMPOSITION.md §8
  15. Global 404 — same archetype
  16. Offline/network-error states

PHASE 6 — Final audit + polish
  Run all 5 accessibility audit rounds (ACCESSIBILITY_AND_QA.md §3). Run
  VISUAL_QA_LOOP.md's full-site pass across every route, with particular
  attention to its axis 9 (cross-page consistency) and PAGE_COMPOSITION.md
  §10's consistency checklist — this is the only point in the build where
  enough pages exist side by side to actually judge whether the "same kind
  of thing" looks the same everywhere. Fix every finding per the priority
  order in ACCESSIBILITY_AND_QA.md §4. Present the completion report (§5)
  — only after both the accessibility and visual passes are clean, present
  the result as done.
```

Do not skip ahead to page content before Phase 1's foundation is confirmed — every page built before tokens.css is real will need to be revisited once real token names are confirmed, which costs more time than doing it in order. Likewise, do not batch visual QA to the end of a phase to save time — per-page checking is cheaper than discovering the same compositional mistake baked into five pages at once.

---

## Step 6 — Trigger message (send this to start)

> "Read DESIGN_SYSTEM.md, COMPONENT_SPEC.md, ACCESSIBILITY_AND_QA.md, PAGE_COMPOSITION.md, VISUAL_QA_LOOP.md, and MCP_AND_TOOLING_SETUP.md completely. Tell me which tools from MCP_AND_TOOLING_SETUP.md §1 are already connected and which I should connect before we start — particularly a browser MCP for the visual QA loop, since building without it means skipping the one check that catches compositional problems.
>
> Then read UX4G_BRD_Template.md and tell me which §11 brand/visual fields and which §9.1 language fields are still unanswered — ask me those before proceeding, offering the UX4G default theme as a valid answer to the color question.
>
> Once that's resolved, confirm the real `--ux4g-*` token names against the installed package or `doc.ux4g.gov.in/web/ai.txt` — do not guess them from Figma-style names.
>
> Then begin Phase 1 — Foundation. Show me that output before Phase 2.
>
> Do not write a page component before the foundation is confirmed. Do not present any page without running VISUAL_QA_LOOP.md against it first, on top of the accessibility self-audit — a page that passes lint and axe but was never actually screenshotted and looked at is not done. Do not leave any image as a grey box. Do not hardcode a single hex value anywhere. Do not connect or use any tool listed in MCP_AND_TOOLING_SETUP.md §2."

---

## What NOT to bring in from `UX4G_CodeGen_Prompt_v1.md`

That file's phased structure, audit-round *shape*, mock-data pattern, i18n approach, and image-placeholder philosophy were good enough to preserve above, corrected. Its **token names, hex values, and Tailwind-based responsive/styling patterns are invalid for this project** and must not be copied in from it directly — see DESIGN_SYSTEM.md §0 for why. If that file is still sitting in the repo, treat it as historical/reference only, not as an instruction source.
