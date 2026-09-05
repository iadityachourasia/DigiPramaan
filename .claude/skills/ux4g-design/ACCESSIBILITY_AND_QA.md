# ACCESSIBILITY_AND_QA.md
### WCAG 2.1 AA contract + audit protocol for this project

Baseline standard: **WCAG 2.1 Level AA**, non-negotiable for a GoI product (BRD §12, A-01). GIGW 3.0 alignment required where the BRD's regulatory scope (§1.3) names it.

---

## 1. Contrast contract (Design.md §9 — authoritative values)

4.5:1 normal text · 3:1 large text and non-text UI boundaries · 44×44px minimum touch target · visible focus via `Focus/Outline` on every interactive element, always, never `outline: none` without a compliant replacement.

**Known-failing defaults — fix before shipping any screen that uses them, not backlog:**

| Token | Fails at | Fix |
|---|---|---|
| `Control/Border/Default` | 1.21:1 (L) / 1.73:1 (D) | Repoint to `Border/Neutral/Strong` (4.54:1) or `Control/Border/Error` (4.38:1) for any input/checkbox/radio boundary |
| `Control/Border/Hover` | 1.35:1 (L) / 2.29:1 (D) | Same fix, hover state |
| `Control/Track/Off` | 1.35:1 (L) / 1.73:1 (D) | Toggle/switch off-state track — repoint similarly |
| `Border/Neutral/Default` | 1.35:1 (L) / 2.29:1 (D) | OK for purely decorative dividers in an already-bounded table; **not** OK as a control boundary |
| `Text/Neutral/Tertiary` on `Background/Neutral/Soft` | 4.35:1 (L only) | Marginal — avoid this exact pairing for body text; use `Background/Neutral/Default` or `Elevated` instead |

Every screen that ships an input, checkbox, radio, or switch must have made an explicit token substitution for its border/track — treat "used the default token" as a finding, not a pass, until it's verified against the table above.

---

## 2. BRD accessibility requirements (§12 — full list, carried forward as acceptance criteria)

| ID | Requirement | Standard |
|---|---|---|
| A-01 | WCAG 2.1 Level AA on all pages | WCAG 2.1 |
| A-02 | All images have meaningful alt text | WCAG 1.1.1 |
| A-03 | No auto-playing/auto-scrolling content without pause control | WCAG 2.2.2 |
| A-04 | Text contrast ≥4.5:1 normal, ≥3:1 large — both themes | WCAG 1.4.3 |
| A-05 | All interactive elements keyboard-navigable with visible focus | WCAG 2.4.7 |
| A-06 | All form fields have associated visible labels | WCAG 1.3.1 |
| A-07 | Error messages describe the fix, not just the error | WCAG 3.3.1 |
| A-08 | Skip-to-main-content link functional | WCAG 2.4.1 |
| A-09 | Touch targets ≥44×44px | WCAG 2.5.5 |
| A-10 | No information conveyed by color alone | WCAG 1.4.1 |
| A-11 | Session timeout warns before expiry with extension option | WCAG 2.2.1 |
| A-12 | Linked PDFs must be tagged accessible | WCAG 1.3.1 |
| A-13 | Tested with NVDA+Chrome and VoiceOver+Safari before launch | Manual |

Add any product-specific accessibility requirement the filled BRD identifies (its §12 has an open row for this) — this list is the floor, not the ceiling.

**Accessibility design floor:** BRD §4 asks for "the most extreme accessibility need" across personas — that persona's needs set the actual bar for this product, above and beyond the checklist. If the BRD hasn't named one yet, that's a gap to raise before design decisions (font size defaults, target sizes, motion) get locked in.

---

## 3. Self-audit protocol — run after every page/component draft

Adapted from `UX4G_CodeGen_Prompt_v1.md`'s audit structure, corrected to reference real UX4G tokens/components instead of that file's fabricated ones (see DESIGN_SYSTEM.md §0). The process structure is genuinely good practice; the token references in the original file were not.

### Round 1 — Visual
```
□ Every card/panel at a consistent, deliberate elevation level (DESIGN_SYSTEM §10)
□ Dark mode: no surface relying on Soft vs Subtle for hierarchy (they collide — §7)
□ Exactly one Display/Heading top-level size per page; no skipped heading levels
□ Title/* used for card/panel headings, Heading/* reserved for document outline
□ Status colors used only for actual status semantics, never as decoration
□ Brand primary used for primary actions/identity, not as a large background wash
□ No raw hex/px anywhere — everything traces to a tier-2/tier-3 token
```

### Round 2 — Functional
```
□ Every button has a real handler; every link resolves to a real route
□ Every form has onSubmit + validation; every field uses Form Field component
□ Modals/Drawers trap focus and close on Escape (should be free — runtime-provided)
□ Every data-fetching component renders loading / error / empty (Empty State) / success
□ Empty State component used for zero-results, not a hand-rolled message
□ Pagination component used, not custom page-number buttons
```

### Round 3 — Accessibility
```
□ axe DevTools or eslint-plugin-jsx-a11y: zero errors, zero warnings
□ Full keyboard traversal: every interactive element reachable, focus always visible
□ Every image: meaningful alt, or alt="" only if genuinely decorative
□ Every form field: visible label associated via htmlFor/id; error uses role="alert"
□ Contrast re-checked against the §1 failing-token table — confirm substitutions were made
□ Skip-to-main-content link present and functional (A-08)
□ Session timeout warning implemented if the product has authenticated sessions (A-11)
```

### Round 4 — Code quality
```
□ TypeScript strict mode: zero errors
□ ESLint: zero errors
□ No hardcoded hex colors — everything is var(--ux4g-*), confirmed against the real
  shipped package (not guessed by pattern, per DESIGN_SYSTEM §0)
□ No hardcoded pixel spacing — UX4G spacing utilities/tokens only
□ No user-visible string hardcoded outside the i18n message files
□ No console.log in committed code
```

### Round 5 — Content
```
□ No placeholder/lorem-ipsum/"Test"/"Dummy" text in anything user-visible
□ All BRD §9.4 mandatory footer content present: copyright, accessibility statement,
  privacy policy, RTI link, last-updated date
□ Languages match BRD §9.1's launch list — no more, no fewer, unless BRD is updated
□ Every page has a real <title> and meta description
```

---

## 4. Fix priority order

```
P0 — fix immediately, don't proceed until resolved:
  - Any TypeScript error
  - Any accessibility error (axe zero-tolerance)
  - Broken interactive element (button/link/form with no handler)
  - Missing navigation or footer on any page
  - A known-failing contrast token (§1) shipped without substitution

P1 — fix before presenting a first draft:
  - Missing loading/error/empty states
  - Hardcoded colors instead of tokens
  - Missing alt text
  - No responsive reflow at 390px / 768px / 1440px (BRD §8.4 minimum viewport 320px)

P2 — fix before final handoff:
  - Missing translations for launch languages (BRD §9.1)
  - Sub-optimal visual hierarchy
  - Missing page metadata
```

---

## 5. Completion report (Design.md §0.6 / SKILL.md — required after every implementation pass)

Report, every time, before claiming compliance:

- UX4G package or CDN delivery method and documentation sources used.
- Every UX4G component, variant, size, class, utility, and token actually used.
- Whether the default theme or an approved root token override was used, and which BRD §11.3 values it maps to.
- Every custom CSS rule added, and specifically why UX4G could not provide it (per Design.md §0.6, custom CSS is allowed only for application-specific layout/behaviour UX4G doesn't cover — name the gap).
- Light and dark theme verification (both, always — not just the default the browser happened to load in).
- Responsive verification (Mobile/Tablet/Desktop/Desktop XL ranges from DESIGN_SYSTEM §8).
- Keyboard, focus, target-size, semantic, and contrast verification — cite the specific tokens checked against §1's failing-token table.
- Unresolved contract exceptions or known debt carried forward.

**Do not claim UX4G compliance without this verification having actually been run.**

---

## 6. Relationship to the other two audit layers

This file's 5 rounds are the UX4G-specific, mandatory compliance check. Two more checks run alongside it, each catching something this one doesn't by design:

- **`VISUAL_QA_LOOP.md`** — a screenshot can't show you a missing `alt` attribute, and this checklist can't show you that a card's shadow is too heavy. Run both; neither substitutes for the other.
- **Web Interface Guidelines skill**, if installed (`MCP_AND_TOOLING_SETUP.md`) — an independently-maintained spec that will occasionally name something neither this file nor a screenshot rubric happens to cover. Treat its findings as prompts to re-check, and where it ever suggests something that conflicts with a UX4G token, class, or component, UX4G wins — the authority order in `DESIGN_SYSTEM.md` §0 applies to every tool in this project, not only to the written specs.
