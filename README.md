# Digi-Pramaan

Legal Metrology Compliance System. Frontend for SIH26034. Scans packaged commodity labels and checks mandatory
declarations against the Legal Metrology (Packaged Commodities) Rules, 2011, for the
Department of Consumer Affairs.

Built on the UX4G Design System v3, which is mandatory for Government of India
digital products. The full build contract lives in `.claude/skills/ux4g-design/`;
`CLAUDE.md` holds the non-negotiables.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

There is no backend yet. `NEXT_PUBLIC_USE_MOCK_DATA` defaults to true and the app
serves the fixtures in `src/lib/mock/`, which match the shape the real API is
expected to return.

## Checks

| Command | What it does |
|---|---|
| `npm run verify` | Runs all four gates below in order. Use this before any commit. |
| `npm run verify:tokens` | Regenerates `src/styles/tokens.css` from the installed UX4G package, then fails if any `--ux4g-*` token or `ux4g-*` class used in `src/` does not exist in that package. |
| `npm run i18n:check` | Fails if a locale file has drifted out of step with `en.json`. |
| `npm run typecheck` | TypeScript strict, zero errors. |
| `npm run lint` | ESLint with `jsx-a11y` at error level, zero warnings. |
| `npm test` | Vocabulary, status-model and mock-data consistency tests. |
| `npm run qa:visual -- /` | Screenshots a route at three widths in both themes into `qa-screenshots/`. |

`npm run verify:tokens` is the guard behind the rule that matters most here. UX4G
documents its tokens under Figma-side names like `Background/Neutral/Default`, and
the shipped CSS spells that `--ux4g-bg-neutral`. Guessing the CSS name from the
Figma name is how fabricated tokens get into a codebase, so the script checks every
reference against the installed package instead of trusting anyone's memory.

## Layout

```
src/
  app/[locale]/     routes, locale-segmented
  components/       ui/ layout/ sections/ and feature folders
  i18n/             next-intl routing, request config, navigation
  lib/mock/         fixtures matching the real API shape
  messages/         en.json, hi.json
  styles/           tokens.css (generated), brand.css, typography.css
  types/            domain model, including the fixed vocabulary
scripts/            token verifier, locale sync, placeholder generator, visual QA
```

## Decisions worth knowing

**Role comes from the account, not a dropdown.** Login has no role selector. The
backend returns the role with the session, and the sidebar reads it from there. Three
seeded accounts in `src/lib/mock/users.ts` cover the three roles.

**English at launch, Hindi scaffolded.** Both locales route and both message files
stay in step, but the language switcher offers only what
`NEXT_PUBLIC_ACTIVE_LOCALES` lists. Hindi joins it when its translation is finished.

**UX4G default theme.** `src/styles/brand.css` is deliberately empty. If DoCA
supplies a palette, that file explains exactly which three primitives to override and
what to re-check afterwards.

**Fixed vocabulary is code, not convention.** Compliance statuses, roles, source tags
and the ten violation categories are constants in `src/types/vocabulary.ts`, and a
test asserts the English message catalogue matches them verbatim.
